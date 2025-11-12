# app.py
from groq import Groq
from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
import re
import uuid
from typing import Dict, List, Optional
import PyPDF2
import speech_recognition as sr
from PIL import Image
import pytesseract
from collections import defaultdict
from sqlalchemy import create_engine, Column, String, Text, ForeignKey, JSON as SQLJSON, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, Session
import networkx as nx

# --- 1. NUEVA CONFIGURACIÓN DE BASE DE DATOS ---
# Usamos un nuevo nombre de archivo para la base de datos relacional.
DATABASE_URL = "sqlite:///./knowledge_graphs_relational.db"
DB_FILE = "./knowledge_graphs_relational.db"

# ¡Importante! Elimina tu antigua base de datos .db si existe
OLD_DB_FILE = "./knowledge_graphs_session.db"
if os.path.exists(OLD_DB_FILE):
    print(f"Eliminando base de datos antigua (formato JSON): {OLD_DB_FILE}")
    os.remove(OLD_DB_FILE)

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

# Habilitar claves foráneas (FK) para SQLite para que funcione ON DELETE CASCADE
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- 2. NUEVOS MODELOS DE BASE DE DATOS (ARQUITECTURA RELACIONAL) ---

# La tabla de Usuarios se mantiene igual
class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    preferences = relationship("Preference", back_populates="user", cascade="all, delete-orphan")
    # Relación para saber qué grafos le pertenecen (para el historial)
    graphs = relationship("KnowledgeGraph", back_populates="user")
    # Relación para saber qué nodos le pertenecen (para permisos)
    nodes = relationship("GraphNode", back_populates="owner")

# La tabla de Preferencias se mantiene igual
class Preference(Base):
    __tablename__ = "preferences"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    content = Column(SQLJSON, nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    user = relationship("User", back_populates="preferences")

# NUEVA TABLA: KnowledgeGraph (reemplaza la antigua 'Graph')
# Esta tabla solo guarda el título y la relación con el usuario.
class KnowledgeGraph(Base):
    __tablename__ = "knowledge_graphs"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    
    user = relationship("User", back_populates="graphs")
    # Relaciones en cascada: si borras un grafo, se borran todos sus nodos y ejes.
    nodes = relationship("GraphNode", back_populates="graph", cascade="all, delete-orphan")
    edges = relationship("GraphEdge", back_populates="graph", cascade="all, delete-orphan")

# NUEVA TABLA: GraphNode
class GraphNode(Base):
    __tablename__ = "graph_nodes"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    label = Column(String)
    description = Column(Text, nullable=True)
    node_type = Column(String) # 'type' en el JSON
    color = Column(String, nullable=True)
    comments = Column(SQLJSON, nullable=True, default=[])
    
    # Clave foránea al grafo al que pertenece
    graph_id = Column(String, ForeignKey("knowledge_graphs.id", ondelete="CASCADE"), nullable=False)
    # Clave foránea al usuario propietario (para permisos)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    
    graph = relationship("KnowledgeGraph", back_populates="nodes")
    owner = relationship("User", back_populates="nodes")
    
    # Relaciones para ejes (si se borra un nodo, se borran sus ejes)
    edges_from = relationship("GraphEdge", foreign_keys="[GraphEdge.source_node_id]", back_populates="source_node", cascade="all, delete-orphan")
    edges_to = relationship("GraphEdge", foreign_keys="[GraphEdge.target_node_id]", back_populates="target_node", cascade="all, delete-orphan")

# NUEVA TABLA: GraphEdge
class GraphEdge(Base):
    __tablename__ = "graph_edges"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    label = Column(String, nullable=True)
    
    # Clave foránea al grafo al que pertenece
    graph_id = Column(String, ForeignKey("knowledge_graphs.id", ondelete="CASCADE"), nullable=False)
    # Clave foránea al nodo de origen
    source_node_id = Column(String, ForeignKey("graph_nodes.id", ondelete="CASCADE"), nullable=False)
    # Clave foránea al nodo de destino
    target_node_id = Column(String, ForeignKey("graph_nodes.id", ondelete="CASCADE"), nullable=False)

    graph = relationship("KnowledgeGraph", back_populates="edges")
    source_node = relationship("GraphNode", foreign_keys=[source_node_id], back_populates="edges_from")
    target_node = relationship("GraphNode", foreign_keys=[target_node_id], back_populates="edges_to")


# Crear todas las tablas
Base.metadata.create_all(bind=engine)
print(f"Base de datos relacional ({DB_FILE}) creada/lista.")

# --- FIN DE CAMBIOS EN MODELOS ---

# Dependencia de DB (sin cambios)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Cliente Groq (sin cambios)
client = Groq(api_key=os.environ.get("GROQ_API_KEY", "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"))

# SYSTEM_PROMPT (sin cambios respecto al último)
SYSTEM_PROMPT = """
Eres un generador de mapas de conocimiento para materiales educativos. Tu tarea es crear, refinar o expandir un grafo basado en el texto proporcionado por el usuario.

*** IMPORTANTE: Todas las etiquetas (labels) y descripciones (descriptions) en tu respuesta DEBEN estar en ESPAÑOL. ***

Cada nodo debe incluir:
1.  "id": Un ID TEMPORAL único (ej: "concepto_1"). Este ID solo se usa para las relaciones "edges" en esta misma respuesta.
2.  "label": El nombre del concepto en español.
3.  "type": El tipo de nodo (ej: 'concepto_principal', 'concepto_secundario', 'entidad', 'detalle').
4.  "description": Una breve descripción en español (mínimo 10 palabras).
5.  "color": Asigna un color hexadecimal para indicar la jerarquía. Usa colores brillantes.
    * '#FFB347' (Naranja) para Conceptos Principales (los más importantes).
    * '#77DD77' (Verde) para Conceptos Secundarios.
    * '#AEC6CF' (Azul Pálido) para Entidades (Personas, Lugares, Fechas).
    * '#B39EB5' (Lila) para Detalles o ejemplos específicos.
6.  "comments": Un array vacío, `[]`.

*** Lógica de Tarea (MUY IMPORTANTE): ***
1.  Primero, analiza la entrada del usuario.
2.  SI la entrada del usuario es un bloque de texto largo (claramente un artículo, una transcripción, etc.), tu tarea es EXTRAER el conocimiento de ESE texto.
3.  SI la entrada del usuario es solo un tema corto (ej: "El Ciclo del Agua", "Historia de la IA", "Filosofía de Platón"), tu tarea es GENERAR un mapa de conocimiento sobre ese tema desde tu propio conocimiento general.
4.  Para expansión (RF03): Si el mensaje del usuario comienza con "Expandir:", enfócate en el nodo especificado. El LLM debe proveer más información si la del usuario es insuficiente, generando nuevos nodos y relaciones.

Responde ÚNICAMENTE con un objeto JSON válido en el siguiente formato, sin texto adicional:
{
  "nodes": [
    {"id": "id_unico_temporal_1", "label": "Etiqueta del Nodo", "type": "concepto_principal", "description": "Descripción...", "color": "#FFB347", "comments": []}
  ],
  "edges": [
    {"from": "id_unico_temporal_1", "to": "id_unico_temporal_2", "label": "Etiqueta de la Relación"}
  ]
}
"""

app = FastAPI()
# Configuración de CORS y WebSocket (sin cambios)
origins = ["http://localhost:5173", "http://127.0.0.1:5173", "http://10.10.0.130:5173"] # Añadida IP de ejemplo
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
collaborations: Dict[str, List[WebSocket]] = defaultdict(list)

# Clases Pydantic (sin cambios)
class GraphRequest(BaseModel): message: str; previous_graph: Optional[Dict] = None; graph_id: Optional[str] = None; title: Optional[str] = None; user_id: str
class FeedbackRequest(BaseModel): feedback: str; graph_id: str; user_id: str
class ExportRequest(BaseModel): graph_id: str; format: str
class UserRequest(BaseModel): user_id: Optional[str] = None
class PreferenceRequest(BaseModel): content: Dict; user_id: str
class CommentRequest(BaseModel): graph_id: str; node_id: str; text: str; user_id: str
class DeleteNodeRequest(BaseModel): graph_id: str; node_id: str; user_id: str

# --- ENDPOINTS ACTUALIZADOS ---

# /create_user (Sin cambios, ya usa la nueva tabla User)
@app.post("/create_user")
async def create_user(request: UserRequest, db: Session = Depends(get_db)):
    user_id = request.user_id
    user = None
    if user_id: user = db.query(User).filter(User.id == user_id).first()
    if user: return {"user_id": user.id}
    else:
        new_user = User()
        db.add(new_user); db.commit(); db.refresh(new_user)
        return {"user_id": new_user.id}

# /upload (Sin cambios)
@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    # ... (código sin cambios) ...
    try:
        if file.filename.endswith('.pdf'):
            pdf_reader = PyPDF2.PdfReader(file.file); text = "".join(page.extract_text() + "\n" for page in pdf_reader.pages)
            return {"extracted_text": text, "notification": None}
        elif file.filename.endswith('.txt'):
            text = await file.read(); return {"extracted_text": text.decode('utf-8'), "notification": None}
        elif file.filename.endswith(('.wav', '.mp3')):
            r = sr.Recognizer();
            with sr.AudioFile(file.file) as source: audio = r.record(source)
            text = r.recognize_google(audio, language="es-ES")
            return {"extracted_text": text, "notification": None}
        elif file.filename.endswith(('.png', '.jpg', '.jpeg')):
            image = Image.open(file.file); text = pytesseract.image_to_string(image, lang='spa')
            return {"extracted_text": text, "notification": None}
        else: raise HTTPException(status_code=400, detail="Tipo de archivo no soportado")
    except Exception as e: return {"extracted_text": None, "notification": f"Error procesando archivo: {str(e)}"}

# --- FUNCIÓN AUXILIAR PARA ENSAMBLAR GRAFOS ---
# Esta función lee las tablas de la DB y crea el JSON que espera el frontend
def assemble_graph_json(graph_id: str, db: Session) -> Dict:
    nodes_db = db.query(GraphNode).filter(GraphNode.graph_id == graph_id).all()
    edges_db = db.query(GraphEdge).filter(GraphEdge.graph_id == graph_id).all()

    nodes_json = [
        {
            "id": node.id,
            "label": node.label,
            "description": node.description,
            "type": node.node_type,
            "color": node.color,
            "comments": node.comments or [],
            "owner_id": node.owner_id
        } for node in nodes_db
    ]
    
    edges_json = [
        {
            "from": edge.source_node_id,
            "to": edge.target_node_id,
            "label": edge.label
        } for edge in edges_db
    ]
    
    return {"nodes": nodes_json, "edges": edges_json}

# --- 3. ENDPOINT /get_graph ACTUALIZADO ---
@app.get("/get_graph/{graph_id}")
async def get_graph(graph_id: str, db: Session = Depends(get_db)):
    # Comprobar si el grafo existe
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == graph_id).first()
    if not graph: 
        raise HTTPException(status_code=404, detail="Grafo no encontrado")
    
    # Ensamblar el JSON desde las tablas
    graph_json = assemble_graph_json(graph_id, db)
    return {"graph": graph_json}

# --- 4. ENDPOINT /generate_graph ACTUALIZADO ---
@app.post("/generate_graph")
async def generate_graph(request: GraphRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user: 
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Si es un grafo existente, lo cargamos. Si no, creamos uno nuevo.
    if request.graph_id:
        graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == request.graph_id).first()
        if not graph:
            raise HTTPException(status_code=404, detail="Grafo no encontrado para modificar")
        graph_id = graph.id
    else:
        # Es un grafo nuevo
        graph = KnowledgeGraph(title=request.title, user_id=request.user_id)
        db.add(graph)
        db.commit() # Commit para obtener el graph.id
        db.refresh(graph)
        graph_id = graph.id

    # 1. Preparar y llamar a Groq (sin cambios)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if request.previous_graph:
        user_content = f"Grafo Anterior: {json.dumps(request.previous_graph)}\n\nInstrucción del Usuario: {request.message}"
    else:
        user_content = request.message
    messages.append({"role": "user", "content": user_content})

    try:
        completion = client.chat.completions.create(
            model="openai/gpt-oss-120b", messages=messages, temperature=0.7, max_tokens=8000, max_completion_tokens=8192,
        )
        json_response = completion.choices[0].message.content
        json_match = re.search(r'\{[\s\S]*\}', json_response)
        if not json_match: raise HTTPException(status_code=500, detail=f"Respuesta de IA no es JSON: {json_response}")
        
        parsed_json = json.loads(json_match.group(0))
        if "nodes" not in parsed_json or "edges" not in parsed_json:
            raise ValueError("Estructura de grafo inválida de IA")

        # 2. Lógica para des-serializar el JSON en la DB Relacional
        
        # Mapeo para rastrear los ID temporales (ej. "concepto_1") a los nuevos UUID de la DB
        temp_id_to_new_uuid_map = {}
        
        # Si es un grafo existente, precargamos el mapa con los nodos existentes
        if request.previous_graph:
            existing_nodes = db.query(GraphNode).filter(GraphNode.graph_id == graph_id).all()
            for node in existing_nodes:
                temp_id_to_new_uuid_map[node.id] = node.id # El ID ya es un UUID

        # Bucle 1: Crear Nodos
        new_nodes_from_json = parsed_json.get("nodes", [])
        for node_data in new_nodes_from_json:
            temp_id = node_data.get("id")
            
            # Chequear si es un nodo que la IA quiere modificar o uno nuevo
            # (Asumimos que si la IA devuelve un ID que ya es UUID, lo está modificando)
            if temp_id in temp_id_to_new_uuid_map:
                # Modificar nodo existente
                node_db = db.query(GraphNode).filter(GraphNode.id == temp_id).first()
                if node_db:
                    node_db.label = node_data.get("label", node_db.label)
                    node_db.description = node_data.get("description", node_db.description)
                    node_db.node_type = node_data.get("type", node_db.node_type)
                    node_db.color = node_data.get("color", node_db.color)
            else:
                # Crear nodo nuevo
                new_node = GraphNode(
                    id=str(uuid.uuid4()), # Nuevo UUID
                    label=node_data.get("label"),
                    description=node_data.get("description"),
                    node_type=node_data.get("type"),
                    color=node_data.get("color"),
                    comments=node_data.get("comments", []),
                    owner_id=request.user_id, # Asignar propietario
                    graph_id=graph_id
                )
                db.add(new_node)
                temp_id_to_new_uuid_map[temp_id] = new_node.id # Mapear temp_id a nuevo UUID

        # Bucle 2: Crear Ejes (después de que todos los nodos estén en la sesión)
        # Primero, borramos los ejes viejos si es un refine/add (lógica simple)
        if request.previous_graph:
            db.query(GraphEdge).filter(GraphEdge.graph_id == graph_id).delete()

        new_edges_from_json = parsed_json.get("edges", [])
        for edge_data in new_edges_from_json:
            source_temp_id = edge_data.get("from")
            target_temp_id = edge_data.get("to")

            # Encontrar los UUIDs reales usando el mapa
            source_real_id = temp_id_to_new_uuid_map.get(source_temp_id)
            target_real_id = temp_id_to_new_uuid_map.get(target_temp_id)

            if source_real_id and target_real_id:
                new_edge = GraphEdge(
                    id=str(uuid.uuid4()),
                    label=edge_data.get("label"),
                    graph_id=graph_id,
                    source_node_id=source_real_id,
                    target_node_id=target_real_id
                )
                db.add(new_edge)
            else:
                print(f"Advertencia: No se pudo crear eje, ID de nodo no encontrado: {source_temp_id} -> {target_temp_id}")

        db.commit() # Guardar todos los cambios

        # 3. Devolver el grafo completo y actualizado
        final_graph_json = assemble_graph_json(graph_id, db)
        await broadcast_update(graph_id, final_graph_json)
        
        return {"graph_id": graph_id, "graph": final_graph_json}
    
    except Exception as e:
        db.rollback()
        print(f"Error en generate_graph: {e}")
        raise HTTPException(status_code=500, detail=f"Error al generar/guardar grafo: {str(e)}")


# --- 5. ENDPOINT /delete_node ACTUALIZADO (Ahora es mucho más simple) ---
@app.post("/delete_node")
async def delete_node(request: DeleteNodeRequest, db: Session = Depends(get_db)):
    
    # 1. Encontrar el nodo en la DB
    node_to_delete = db.query(GraphNode).filter(
        GraphNode.id == request.node_id,
        GraphNode.graph_id == request.graph_id
    ).first()

    if not node_to_delete:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")

    # 2. Lógica de restricción (¡directo en la consulta!)
    if node_to_delete.owner_id != request.user_id:
        raise HTTPException(
            status_code=403, 
            detail="Acción denegada: No puedes eliminar un nodo que no te pertenece."
        )
    
    # 3. Eliminar el nodo. La DB (con 'ON DELETE CASCADE') se encarga de los ejes.
    try:
        db.delete(node_to_delete)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error de base de datos al eliminar: {e}")

    # 4. Notificar a todos los clientes
    final_graph_json = assemble_graph_json(request.graph_id, db)
    await broadcast_update(request.graph_id, final_graph_json)

    return {"graph": final_graph_json}


# --- 6. ENDPOINTS /expand_node y /refine_graph ACTUALIZADOS ---
# (Usan la lógica de `generate_graph` pero necesitan ensamblar el `previous_graph` primero)

async def get_previous_graph_json(graph_id: str, db: Session) -> Optional[Dict]:
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == graph_id).first()
    if not graph:
        return None
    return assemble_graph_json(graph_id, db)

@app.post("/expand_node")
async def expand_node(request: GraphRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user: raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if not request.graph_id: raise HTTPException(status_code=400, detail="Graph ID es requerido")

    # Ensamblar el grafo anterior desde la DB
    request.previous_graph = await get_previous_graph_json(request.graph_id, db)
    if not request.previous_graph:
        raise HTTPException(status_code=404, detail="Grafo no encontrado")
        
    if not request.message.startswith("Expandir:"): 
        request.message = f"Expandir: {request.message}"
    
    # Reutiliza la lógica principal de generate_graph
    return await generate_graph(request, db)

@app.post("/refine_graph")
async def refine_graph(request: FeedbackRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user: raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Ensamblar el grafo anterior desde la DB
    previous_graph_json = await get_previous_graph_json(request.graph_id, db)
    if not previous_graph_json:
        raise HTTPException(status_code=404, detail="Grafo no encontrado")

    graph_db = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == request.graph_id).first()

    # Preparar la solicitud para generate_graph
    graph_request = GraphRequest(
        message=request.feedback,
        previous_graph=previous_graph_json,
        graph_id=request.graph_id,
        user_id=request.user_id,
        title=graph_db.title
    )
    
    return await generate_graph(graph_request, db)

# --- 7. ENDPOINTS RESTANTES ACTUALIZADOS ---

@app.get("/graph_history/{user_id}")
async def graph_history(user_id: str, db: Session = Depends(get_db)):
    # Lógica global (como pediste antes)
    print(f"Usuario {user_id} solicitando historial de grafos (modo global).")
    todos_los_grafos = db.query(KnowledgeGraph).order_by(KnowledgeGraph.title).all()
    graphs_list = [{"id": g.id, "title": g.title} for g in todos_los_grafos]
    return {"graphs": graphs_list}

@app.post("/add_comment")
async def add_comment(request: CommentRequest, db: Session = Depends(get_db)):
    # Ahora esto es mucho más eficiente
    node = db.query(GraphNode).filter(
        GraphNode.id == request.node_id,
        GraphNode.graph_id == request.graph_id
    ).first()
    
    if not node:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")

    # Modificar el campo JSON
    if not node.comments:
        node.comments = []
    
    node.comments.append({
        "user_id": request.user_id,
        "text": request.text,
        "timestamp": str(uuid.uuid4())
    })
    
    db.commit()
    db.refresh(node)

    # Notificar a todos
    final_graph_json = assemble_graph_json(request.graph_id, db)
    await broadcast_update(request.graph_id, final_graph_json)
    
    return {"graph": final_graph_json}

# WebSocket y broadcast (sin cambios)
@app.websocket("/ws/{graph_id}")
async def websocket_endpoint(websocket: WebSocket, graph_id: str):
    await websocket.accept()
    db = SessionLocal()
    graph_exists = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == graph_id).first()
    db.close()
    if not graph_exists:
        await websocket.close(code=1008, reason="Graph not found")
        return

    collaborations[graph_id].append(websocket)
    print(f"WebSocket connected for graph {graph_id}. Conns: {len(collaborations[graph_id])}")
    try:
        while True:
            # Lógica de recepción (si decides implementar edición en vivo por WS)
            data = await websocket.receive_text()
            print(f"WS Recibido: {data}")
            # Por ahora, este WS es principalmente para 'broadcast_update'
            
    except WebSocketDisconnect:
        collaborations[graph_id].remove(websocket)
        print(f"WebSocket disconnected for graph {graph_id}. Remaining: {len(collaborations[graph_id])}")

async def broadcast_update(graph_id: str, graph_data: Dict, exclude_sender: Optional[WebSocket] = None):
    active_connections = collaborations.get(graph_id, [])
    print(f"Broadcasting update for graph {graph_id} to {len(active_connections)} client(s).")
    message = json.dumps({"type": "update", "graph": graph_data})
    for connection in active_connections:
        if connection != exclude_sender:
            try: await connection.send_text(message)
            except Exception as e: print(f"Error sending broadcast: {e}")

# Endpoints de /analyze_graph, /contextual_help, /export_graph, /get_preferences, /update_preferences (sin cambios funcionales, solo usan nuevos modelos)

@app.post("/export_graph")
async def export_graph(request: ExportRequest, db: Session = Depends(get_db)):
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == request.graph_id).first()
    if not graph: raise HTTPException(status_code=404, detail="Grafo no encontrado")
    if request.format == 'json':
        return assemble_graph_json(request.graph_id, db)
    else: 
        raise HTTPException(status_code=400, detail="Formato no soportado (solo json)")

@app.post("/analyze_graph")
async def analyze_graph(request: ExportRequest, db: Session = Depends(get_db)):
    graph_json = assemble_graph_json(request.graph_id, db)
    if not graph_json or "nodes" not in graph_json or "edges" not in graph_json:
         raise HTTPException(status_code=400, detail="El contenido del grafo es inválido o está vacío.")
    
    G = nx.DiGraph(); node_map = {}
    try:
        for node in graph_json.get("nodes", []):
            node_id = node.get("id");
            if node_id: G.add_node(node_id, label=node.get("label", "Sin etiqueta")); node_map[node_id] = node.get("label", "Sin etiqueta")
        for edge in graph_json.get("edges", []):
            source_id = edge.get("from"); target_id = edge.get("to")
            if source_id in G.nodes and target_id in G.nodes: G.add_edge(source_id, target_id, label=edge.get("label", ""))
        
        in_degree_centrality = nx.in_degree_centrality(G); out_degree_centrality = nx.out_degree_centrality(G)
        label_in_centrality = {node_map.get(node_id, node_id): value for node_id, value in in_degree_centrality.items()}
        label_out_centrality = {node_map.get(node_id, node_id): value for node_id, value in out_degree_centrality.items()}
        return {"analytics": {"in_degree_centrality": label_in_centrality, "out_degree_centrality": label_out_centrality}}
    except Exception as e: raise HTTPException(status_code=500, detail=f"Error durante el análisis: {str(e)}")

@app.post("/contextual_help")
async def contextual_help(request: GraphRequest, db: Session = Depends(get_db)):
    previous_graph_json = None
    if request.graph_id:
        previous_graph_json = await get_previous_graph_json(request.graph_id, db)
        
    help_prompt = f"Proporciona sugerencias contextuales o tutorial breve en español para: {request.message}\nConsiderando este grafo (si existe): {json.dumps(previous_graph_json)}"
    messages = [{"role": "system", "content": "Eres un asistente útil para grafos de conocimiento. Responde brevemente en español."},
                {"role": "user", "content": help_prompt}]
    try:
        completion = client.chat.completions.create(model="openai/gpt-oss-20b", messages=messages, temperature=0.7, max_tokens=4503)
        return {"help": completion.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo ayuda: {str(e)}")

@app.post("/update_preferences")
async def update_preferences(request: PreferenceRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user: raise HTTPException(status_code=404, detail="Usuario no encontrado...")
    pref = db.query(Preference).filter(Preference.user_id == request.user_id).first()
    if pref: pref.content = request.content
    else: pref = Preference(content=request.content, user_id=request.user_id); db.add(pref)
    db.commit(); db.refresh(pref); return {"preferences": pref.content}

@app.get("/get_preferences/{user_id}")
async def get_preferences(user_id: str, db: Session = Depends(get_db)):
    pref = db.query(Preference).filter(Preference.user_id == user_id).first()
    if not pref: return {"preferences": {}}
    return {"preferences": pref.content}

if __name__ == "__main__":
    import uvicorn
    if not os.environ.get("GROQ_API_KEY"): print("ADVERTENCIA: GROQ_API_KEY no está configurada como variable de entorno.")
    uvicorn.run(app, host="0.0.0.0", port=8000)