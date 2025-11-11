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
from sqlalchemy import create_engine, Column, String, Text, ForeignKey, JSON as SQLJSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, Session
import networkx as nx

# ... (Configuración de DB, Modelos, get_db, Cliente Groq, SYSTEM_PROMPT, app, CORS... todo sin cambios) ...
DATABASE_URL = "sqlite:///./knowledge_graphs_session.db"
DB_FILE = "./knowledge_graphs_session.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    graphs = relationship("Graph", back_populates="user")
    preferences = relationship("Preference", back_populates="user")

class Preference(Base):
    __tablename__ = "preferences"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    content = Column(SQLJSON, nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    user = relationship("User", back_populates="preferences")

class Graph(Base):
    __tablename__ = "graphs"
    id = Column(String, primary_key=True, index=True)
    content = Column(SQLJSON, nullable=False)
    title = Column(String, nullable=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    user = relationship("User", back_populates="graphs")

Base.metadata.create_all(bind=engine)
print(f"Base de datos temporal ({DB_FILE}) creada/lista.")

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

client = Groq(api_key=os.environ.get("GROQ_API_KEY", "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"))
SYSTEM_PROMPT = """
Eres un generador de mapas de conocimiento para materiales educativos. Tu tarea es crear, refinar o expandir un grafo basado en el texto proporcionado por el usuario.

*** IMPORTANTE: Todas las etiquetas (labels) y descripciones (descriptions) en tu respuesta DEBEN estar en ESPAÑOL. ***

Cada nodo debe incluir:
1.  "id": Un ID único (ej: "concepto_1").
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
    {"id": "id_unico", "label": "Etiqueta del Nodo", "type": "concepto_principal", "description": "Descripción...", "color": "#FFB347", "comments": []}
  ],
  "edges": [
    {"from": "id_origen", "to": "id_destino", "label": "Etiqueta de la Relación"}
  ]
}

...
Cada nodo debe incluir:
1.  "id": Un ID único (ej: "concepto_1").
2.  "label": El nombre del concepto en español.
3.  "type": El tipo de nodo...
4.  "description": Una breve descripción en español.
5.  "color": Asigna un color hexadecimal...
6.  "comments": Un array vacío, `[]`.
7.  "owner_id": (Opcional) Un UUID del usuario propietario. Si estás refinando, PRESERVA este campo.
...
"""

app = FastAPI()
origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
collaborations: Dict[str, List[WebSocket]] = defaultdict(list)

class GraphRequest(BaseModel): message: str; previous_graph: Optional[Dict] = None; graph_id: Optional[str] = None; title: Optional[str] = None; user_id: str
class FeedbackRequest(BaseModel): feedback: str; graph_id: str; user_id: str
class ExportRequest(BaseModel): graph_id: str; format: str
class UserRequest(BaseModel): user_id: Optional[str] = None
class PreferenceRequest(BaseModel): content: Dict; user_id: str
class CommentRequest(BaseModel): graph_id: str; node_id: str; text: str; user_id: str

class DeleteNodeRequest(BaseModel):
    graph_id: str
    node_id: str
    user_id: str


@app.post("/create_user")
async def create_user(request: UserRequest, db: Session = Depends(get_db)):
    # ... (código sin cambios) ...
    user_id = request.user_id
    user = None
    if user_id: user = db.query(User).filter(User.id == user_id).first()
    if user: return {"user_id": user.id}
    else:
        new_user = User()
        db.add(new_user); db.commit(); db.refresh(new_user)
        return {"user_id": new_user.id}

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

@app.post("/generate_graph")
async def generate_graph(request: GraphRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user: raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    graph_id = request.graph_id or str(uuid.uuid4())
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    # ... (resto de la lógica de mensajes) ...
    if request.previous_graph: user_content = f"Grafo Anterior: {json.dumps(request.previous_graph)}\n\nInstrucción del Usuario: {request.message}"
    else: user_content = request.message
    messages.append({"role": "user", "content": user_content})

    try:
        completion = client.chat.completions.create(
            model="openai/gpt-oss-120b", # o el modelo que uses
            messages=messages,
            temperature=0.7,
            max_tokens=8000,
            max_completion_tokens=8192,
            top_p=1,
            stream=False,
        )
        json_response = completion.choices[0].message.content
        json_match = re.search(r'\{[\s\S]*\}', json_response)
        if not json_match: raise HTTPException(status_code=500, detail=f"La respuesta de la IA no contenía JSON. Respuesta: {json_response}")
        
        json_str = json_match.group(0)
        parsed_json = json.loads(json_str)
        
        if not isinstance(parsed_json, dict) or "nodes" not in parsed_json or "edges" not in parsed_json:
            raise ValueError("Estructura de grafo inválida")
        
        existing_node_ids = set()
        if request.previous_graph and 'nodes' in request.previous_graph:
            existing_node_ids = {n['id'] for n in request.previous_graph['nodes']}

        for node in parsed_json.get("nodes", []):
            # Si el nodo es nuevo (no estaba en el grafo anterior)
            # O si el grafo es totalmente nuevo (previous_graph es None)
            if node['id'] not in existing_node_ids:
                node['owner_id'] = request.user_id

        graph = db.query(Graph).filter(Graph.id == graph_id).first()
        if graph:
            graph.content = parsed_json
            graph.title = request.title if request.title else graph.title
        else:
            graph = Graph(id=graph_id, content=parsed_json, title=request.title, user_id=request.user_id)
            db.add(graph)
        db.commit()
        db.refresh(graph)
        
        # --- 1. DESCOMENTAR ESTA LÍNEA ---
        await broadcast_update(graph_id, parsed_json)
        
        return {"graph_id": graph_id, "graph": parsed_json}
    
    except json.JSONDecodeError as e: raise HTTPException(status_code=500, detail=f"JSON inválido: {e}. Respuesta recibida: {json_str[:200]}...")
    except Exception as e: raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.post("/expand_node")
async def expand_node(request: GraphRequest, db: Session = Depends(get_db)):
    # ... (código de verificación sin cambios) ...
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user: raise HTTPException(status_code=404, detail="Usuario no encontrado...")
    graph = db.query(Graph).filter(Graph.id == request.graph_id, Graph.user_id == request.user_id).first()
    if not graph: raise HTTPException(status_code=404, detail="Grafo no encontrado")
    request.previous_graph = graph.content
    if not request.message.startswith("Expandir:"): request.message = f"Expandir: {request.message}"
    
    response = await generate_graph(request, db)
    
    # --- 2. DESCOMENTAR ESTA LÍNEA --- (Ya estaba descomentada en tu archivo, ¡perfecto!)
    # (Esta línea ya no está comentada en tu app.py, lo cual es correcto)
    await broadcast_update(request.graph_id, response["graph"]) 
    
    return response
@app.post("/delete_node")
async def delete_node(request: DeleteNodeRequest, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == request.graph_id).first()
    if not graph: 
        raise HTTPException(status_code=404, detail="Grafo no encontrado")

    graph_content = graph.content
    nodes = graph_content.get("nodes", [])
    edges = graph_content.get("edges", [])
    
    node_to_delete = None
    node_index = -1

    # Encontrar el nodo y su propietario
    for i, node in enumerate(nodes):
        if node.get("id") == request.node_id:
            node_to_delete = node
            node_index = i
            break

    if not node_to_delete:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")

    # --- LÓGICA DE RESTRICCIÓN ---
    node_owner = node_to_delete.get("owner_id")
    
    # Advertencia: Si el nodo no tiene propietario (es antiguo), cualquiera puede borrarlo.
    # Solo restringimos si el propietario existe y NO es el usuario actual.
    if node_owner and node_owner != request.user_id:
        raise HTTPException(
            status_code=403, 
            detail="Acción denegada: No puedes eliminar un nodo que no te pertenece."
        )
    
    # Si pasa la restricción, eliminar el nodo y sus ejes
    
    # 1. Eliminar nodo
    nodes.pop(node_index)
    
    # 2. Eliminar ejes conectados
    edges_to_keep = [
        edge for edge in edges 
        if edge.get("from") != request.node_id and edge.get("to") != request.node_id
    ]
    
    graph_content["nodes"] = nodes
    graph_content["edges"] = edges_to_keep
    
    # Guardar cambios en la DB
    graph.content = graph_content
    db.commit()
    db.refresh(graph)

    # Notificar a todos
    await broadcast_update(request.graph_id, graph.content)

    return {"graph": graph.content}

@app.post("/refine_graph")
async def refine_graph(request: FeedbackRequest, db: Session = Depends(get_db)):
    # ... (código de verificación sin cambios) ...
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user: raise HTTPException(status_code=404, detail="Usuario no encontrado...")
    graph = db.query(Graph).filter(Graph.id == request.graph_id, Graph.user_id == request.user_id).first()
    if not graph: raise HTTPException(status_code=404, detail="Grafo no encontrado")
    graph_request = GraphRequest(
        message=request.feedback, previous_graph=graph.content,
        graph_id=request.graph_id, user_id=request.user_id, title=graph.title
    )
    
    response = await generate_graph(graph_request, db)
    
    # --- 3. DESCOMENTAR ESTA LÍNEA --- (Ya estaba descomentada en tu archivo, ¡perfecto!)
    # (Esta línea ya no está comentada en tu app.py, lo cual es correcto)
    await broadcast_update(request.graph_id, response["graph"])
    
    return response

# ... (Endpoints /export_graph, /graph_history, /get_graph sin cambios) ...
@app.post("/export_graph")
async def export_graph(request: ExportRequest, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == request.graph_id).first();
    if not graph: raise HTTPException(status_code=404, detail="Grafo no encontrado")
    if request.format == 'json': return graph.content
    else: raise HTTPException(status_code=400, detail="Formato no soportado (solo json)")

@app.get("/graph_history/{user_id}")
async def graph_history(user_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user: return {"graphs": []}
    graphs_list = [{"id": g.id, "title": g.title} for g in user.graphs]
    return {"graphs": graphs_list}

@app.get("/get_graph/{graph_id}")
async def get_graph(graph_id: str, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph: raise HTTPException(status_code=404, detail="Grafo no encontrado")
    return {"graph": graph.content}

# ... (Endpoint /ws/{graph_id} y broadcast_update sin cambios) ...
@app.websocket("/ws/{graph_id}")
async def websocket_endpoint(websocket: WebSocket, graph_id: str):
    await websocket.accept()
    db = SessionLocal()
    graph_exists = db.query(Graph).filter(Graph.id == graph_id).first()
    db.close()
    if not graph_exists:
        await websocket.close(code=1008, reason="Graph not found")
        return

    collaborations[graph_id].append(websocket)
    print(f"WebSocket connected for graph {graph_id}. Conns: {len(collaborations[graph_id])}")
    try:
        while True:
            data = await websocket.receive_text()
            try:
                update = json.loads(data)
                if update.get("type") == "edit" and "graph" in update:
                    db_session = SessionLocal()
                    try:
                        graph = db_session.query(Graph).filter(Graph.id == graph_id).first()
                        if graph:
                            graph.content = update["graph"]
                            db_session.commit()
                            await broadcast_update(graph_id, update["graph"], exclude_sender=websocket)
                    finally:
                        db_session.close()
            except Exception as e: print(f"Error processing WebSocket message: {e}")
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

# ... (Endpoints /contextual_help, /analyze_graph, /update_preferences, /get_preferences sin cambios) ...
@app.post("/contextual_help")
async def contextual_help(request: GraphRequest):
    # ... (código sin cambios) ...
    help_prompt = f"Proporciona sugerencias... en español para: {request.message}\n...Grafo: {json.dumps(request.previous_graph)}"
    messages = [{"role": "system", "content": "Eres un asistente útil... Responde brevemente en español."}, {"role": "user", "content": help_prompt}]
    try:
        completion = client.chat.completions.create(model="openai/gpt-oss-20b", messages=messages, temperature=0.7, max_tokens=4503)
        return {"help": completion.choices[0].message.content}
    except Exception as e: raise HTTPException(status_code=500, detail=f"Error obteniendo ayuda: {str(e)}")

@app.post("/analyze_graph")
async def analyze_graph(request: ExportRequest, db: Session = Depends(get_db)):
    # ... (código sin cambios) ...
    graph_data = db.query(Graph).filter(Graph.id == request.graph_id).first()
    if not graph_data: raise HTTPException(status_code=404, detail="Grafo no encontrado")
    if not graph_data.content or "nodes" not in graph_data.content or "edges" not in graph_data.content:
         raise HTTPException(status_code=400, detail="El contenido del grafo es inválido o está vacío.")
    G = nx.DiGraph(); node_map = {}
    try:
        for node in graph_data.content.get("nodes", []):
            node_id = node.get("id");
            if node_id: G.add_node(node_id, label=node.get("label", "Sin etiqueta")); node_map[node_id] = node.get("label", "Sin etiqueta")
        for edge in graph_data.content.get("edges", []):
            source_id = edge.get("from"); target_id = edge.get("to")
            if source_id in G.nodes and target_id in G.nodes: G.add_edge(source_id, target_id, label=edge.get("label", ""))
        in_degree_centrality = nx.in_degree_centrality(G); out_degree_centrality = nx.out_degree_centrality(G)
        label_in_centrality = {node_map.get(node_id, node_id): value for node_id, value in in_degree_centrality.items()}
        label_out_centrality = {node_map.get(node_id, node_id): value for node_id, value in out_degree_centrality.items()}
        return {"analytics": {"in_degree_centrality": label_in_centrality, "out_degree_centrality": label_out_centrality}}
    except Exception as e: raise HTTPException(status_code=500, detail=f"Error durante el análisis: {str(e)}")

@app.post("/update_preferences")
async def update_preferences(request: PreferenceRequest, db: Session = Depends(get_db)):
    # ... (código sin cambios) ...
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user: raise HTTPException(status_code=404, detail="Usuario no encontrado...")
    pref = db.query(Preference).filter(Preference.user_id == request.user_id).first()
    if pref: pref.content = request.content
    else: pref = Preference(content=request.content, user_id=request.user_id); db.add(pref)
    db.commit(); db.refresh(pref); return {"preferences": pref.content}

@app.get("/get_preferences/{user_id}")
async def get_preferences(user_id: str, db: Session = Depends(get_db)):
    # ... (código sin cambios) ...
    pref = db.query(Preference).filter(Preference.user_id == user_id).first()
    if not pref: return {"preferences": {}}
    return {"preferences": pref.content}

@app.post("/add_comment")
async def add_comment(request: CommentRequest, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == request.graph_id).first()
    if not graph: raise HTTPException(status_code=404, detail="Grafo no encontrado")

    graph_content = graph.content; node_found = False
    for node in graph_content.get("nodes", []):
        if node.get("id") == request.node_id:
            if "comments" not in node or not isinstance(node["comments"], list): node["comments"] = []
            node["comments"].append({"user_id": request.user_id, "text": request.text, "timestamp": str(uuid.uuid4())})
            node_found = True
            break
    if not node_found: raise HTTPException(status_code=404, detail="Nodo no encontrado")
    
    graph.content = graph_content
    db.add(graph); db.commit(); db.refresh(graph)

    # --- 4. DESCOMENTAR ESTA LÍNEA ---
    await broadcast_update(request.graph_id, graph.content)
    
    return {"graph": graph.content}

if __name__ == "__main__":
    import uvicorn
    if not os.environ.get("GROQ_API_KEY"): print("ADVERTENCIA: GROQ_API_KEY no...")
    uvicorn.run(app, host="0.0.0.0", port=8000)