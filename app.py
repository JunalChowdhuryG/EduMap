# app.py
import os
import json
import re
import uuid
import asyncio
from typing import Dict, List, Optional
from collections import defaultdict
from datetime import datetime

# FastAPI & Pydantic
from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# IA & Procesamiento
from groq import Groq
import PyPDF2
import speech_recognition as sr
from PIL import Image
import pytesseract
import networkx as nx

# Base de Datos (SQLAlchemy)
from sqlalchemy import create_engine, Column, String, Text, ForeignKey, JSON as SQLJSON, event, Integer, DateTime, desc
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, Session
from sqlalchemy.orm.attributes import flag_modified

# --- CONFIGURACIÓN BASE DE DATOS ---
DATABASE_URL = "sqlite:///./knowledge_graphs_v2.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# Habilitar Foreign Keys en SQLite
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- MODELOS DE BASE DE DATOS ---

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    xp = Column(Integer, default=0)
    level = Column(Integer, default=1)
    graphs_created = Column(Integer, default=0)
    
    preferences = relationship("Preference", back_populates="user", cascade="all, delete-orphan")
    graphs = relationship("KnowledgeGraph", back_populates="user")
    nodes = relationship("GraphNode", back_populates="owner")

class Preference(Base):
    __tablename__ = "preferences"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    content = Column(SQLJSON, nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    user = relationship("User", back_populates="preferences")

class KnowledgeGraph(Base):
    __tablename__ = "knowledge_graphs"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    current_version_id = Column(String, nullable=True) # Puntero a la versión actual del historial
    
    user = relationship("User", back_populates="graphs")
    nodes = relationship("GraphNode", back_populates="graph", cascade="all, delete-orphan")
    edges = relationship("GraphEdge", back_populates="graph", cascade="all, delete-orphan")
    versions = relationship("GraphVersion", back_populates="graph", cascade="all, delete-orphan")

class GraphVersion(Base):
    __tablename__ = "graph_versions"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    graph_id = Column(String, ForeignKey("knowledge_graphs.id", ondelete="CASCADE"), nullable=False)
    content = Column(SQLJSON, nullable=False) # Snapshot completo del grafo
    created_at = Column(DateTime, default=datetime.utcnow)
    
    graph = relationship("KnowledgeGraph", back_populates="versions")

class GraphNode(Base):
    __tablename__ = "graph_nodes"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    label = Column(String)
    description = Column(Text, nullable=True)
    node_type = Column(String)
    color = Column(String, nullable=True)
    comments = Column(SQLJSON, nullable=True, default=list)
    
    graph_id = Column(String, ForeignKey("knowledge_graphs.id", ondelete="CASCADE"), nullable=False)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)
    
    graph = relationship("KnowledgeGraph", back_populates="nodes")
    owner = relationship("User", back_populates="nodes")
    
    # Relaciones para los ejes (Edges)
    edges_from = relationship("GraphEdge", foreign_keys="[GraphEdge.source_node_id]", back_populates="source_node", cascade="all, delete-orphan")
    edges_to = relationship("GraphEdge", foreign_keys="[GraphEdge.target_node_id]", back_populates="target_node", cascade="all, delete-orphan")

class GraphEdge(Base):
    __tablename__ = "graph_edges"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    label = Column(String, nullable=True)
    
    graph_id = Column(String, ForeignKey("knowledge_graphs.id", ondelete="CASCADE"), nullable=False)
    source_node_id = Column(String, ForeignKey("graph_nodes.id", ondelete="CASCADE"), nullable=False)
    target_node_id = Column(String, ForeignKey("graph_nodes.id", ondelete="CASCADE"), nullable=False)

    graph = relationship("KnowledgeGraph", back_populates="edges")
    source_node = relationship("GraphNode", foreign_keys=[source_node_id], back_populates="edges_from")
    target_node = relationship("GraphNode", foreign_keys=[target_node_id], back_populates="edges_to")

# Crear tablas
Base.metadata.create_all(bind=engine)

# --- DEPENDENCIAS Y HELPERS ---

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Cliente Groq
client = Groq(api_key=os.environ.get("GROQ_API_KEY", "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")) # Reemplaza o usa ENV
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

# WebSocket Manager
collaborations: Dict[str, List[WebSocket]] = defaultdict(list)

async def broadcast_update(graph_id: str, graph_data: Dict, exclude_sender: Optional[WebSocket] = None):
    active_connections = collaborations.get(graph_id, [])
    message = json.dumps({"type": "update", "graph": graph_data})
    for connection in active_connections:
        if connection != exclude_sender:
            try:
                await connection.send_text(message)
            except Exception:
                pass

def assemble_graph_json(graph_id: str, db: Session) -> Dict:
    """Convierte los datos de la DB relacional a un objeto JSON para el frontend."""
    nodes_db = db.query(GraphNode).filter(GraphNode.graph_id == graph_id).all()
    edges_db = db.query(GraphEdge).filter(GraphEdge.graph_id == graph_id).all()
    
    nodes_json = [{
        "id": node.id, 
        "label": node.label, 
        "description": node.description,
        "type": node.node_type, 
        "color": node.color, 
        "comments": node.comments or [],
        "owner_id": node.owner_id
    } for node in nodes_db]
    
    edges_json = [{
        "from": edge.source_node_id, 
        "to": edge.target_node_id, 
        "label": edge.label
    } for edge in edges_db]
    
    return {"nodes": nodes_json, "edges": edges_json}

def save_new_version(db: Session, graph_id: str):
    """Guarda el estado actual como una nueva versión y elimina futuros alternativos (branching)."""
    current_content = assemble_graph_json(graph_id, db)
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == graph_id).first()
    
    # Si estamos en el pasado (hicimos Undo y luego un cambio), borramos el futuro
    if graph.current_version_id:
        current_ver = db.query(GraphVersion).filter(GraphVersion.id == graph.current_version_id).first()
        if current_ver:
            db.query(GraphVersion).filter(
                GraphVersion.graph_id == graph_id,
                GraphVersion.created_at > current_ver.created_at
            ).delete()
    
    new_version = GraphVersion(graph_id=graph_id, content=current_content)
    db.add(new_version)
    db.commit()
    
    graph.current_version_id = new_version.id
    db.commit()

def restore_graph_from_json(db: Session, graph_id: str, content: Dict, user_id: str):
    """Borra el grafo actual y lo reconstruye desde un JSON (usado para Undo/Redo)."""
    # 1. Borrar datos actuales
    db.query(GraphEdge).filter(GraphEdge.graph_id == graph_id).delete()
    db.query(GraphNode).filter(GraphNode.graph_id == graph_id).delete()
    
    # 2. Reconstruir Nodos
    for node_data in content.get("nodes", []):
        new_node = GraphNode(
            id=node_data["id"],
            label=node_data.get("label"),
            description=node_data.get("description"),
            node_type=node_data.get("type"),
            color=node_data.get("color"),
            comments=node_data.get("comments", []),
            owner_id=node_data.get("owner_id", user_id),
            graph_id=graph_id
        )
        db.add(new_node)
    
    # 3. Reconstruir Ejes
    for edge_data in content.get("edges", []):
        src = db.query(GraphNode).filter(GraphNode.id == edge_data["from"]).first()
        tgt = db.query(GraphNode).filter(GraphNode.id == edge_data["to"]).first()
        if src and tgt:
            new_edge = GraphEdge(
                label=edge_data.get("label"),
                graph_id=graph_id,
                source_node_id=edge_data["from"],
                target_node_id=edge_data["to"]
            )
            db.add(new_edge)
            
    db.commit()

# --- SCHEMAS DE REQUEST ---

class GraphRequest(BaseModel): 
    message: str
    previous_graph: Optional[Dict] = None
    graph_id: Optional[str] = None
    title: Optional[str] = None
    user_id: str
    context: Optional[str] = None

class FeedbackRequest(BaseModel):
    feedback: str
    graph_id: str
    user_id: str

class UserRequest(BaseModel): user_id: Optional[str] = None
class PreferenceRequest(BaseModel): content: Dict; user_id: str
class CommentRequest(BaseModel): graph_id: str; node_id: str; text: str; user_id: str
class DeleteNodeRequest(BaseModel): graph_id: str; node_id: str; user_id: str
class ExportRequest(BaseModel): graph_id: str; format: str
class UserStatsUpdate(BaseModel): user_id: str; xp_gained: int; graphs_increment: int = 0
class QuizRequest(BaseModel): graph_id: str

# --- API ENDPOINTS ---

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://192.168.0.9:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Usuarios
@app.post("/create_user")
async def create_user(request: UserRequest, db: Session = Depends(get_db)):
    if request.user_id:
        user = db.query(User).filter(User.id == request.user_id).first()
        if user: return {"user_id": user.id}
    new_user = User()
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"user_id": new_user.id}

@app.get("/get_user_profile/{user_id}")
async def get_user_profile(user_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if user: return {"xp": user.xp, "level": user.level, "graphs_created": user.graphs_created}
    return {}

@app.post("/update_user_stats")
async def update_user_stats(stats: UserStatsUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == stats.user_id).first()
    if user:
        user.xp += stats.xp_gained
        user.graphs_created += stats.graphs_increment
        user.level = 1 + (user.xp // 100) # Lógica simple de nivel
        db.commit()
        return {"xp": user.xp, "level": user.level, "graphs_created": user.graphs_created}
    raise HTTPException(404, "Usuario no encontrado")

# 2. Upload y Preferencias
@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        text = ""
        if file.filename.endswith('.pdf'):
            pdf_reader = PyPDF2.PdfReader(file.file)
            text = "".join(page.extract_text() + "\n" for page in pdf_reader.pages)
        elif file.filename.endswith('.txt'):
            text = (await file.read()).decode('utf-8')
        # Aquí puedes añadir más formatos (wav, jpg) si tienes las librerías
        return {"extracted_text": text, "notification": None}
    except Exception as e:
        return {"extracted_text": None, "notification": f"Error: {str(e)}"}

@app.get("/get_preferences/{user_id}")
async def get_preferences(user_id: str, db: Session = Depends(get_db)):
    pref = db.query(Preference).filter(Preference.user_id == user_id).first()
    return {"preferences": pref.content} if pref else {"preferences": {}}

@app.post("/update_preferences")
async def update_preferences(request: PreferenceRequest, db: Session = Depends(get_db)):
    pref = db.query(Preference).filter(Preference.user_id == request.user_id).first()
    if pref: pref.content = request.content
    else: db.add(Preference(content=request.content, user_id=request.user_id))
    db.commit()
    return {"preferences": request.content}

# 3. Gestión de Grafos (Core)
@app.post("/generate_graph")
async def generate_graph(request: GraphRequest, db: Session = Depends(get_db)):
    # Verificar Usuario
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user: raise HTTPException(404, "Usuario no encontrado")

    # Crear o Recuperar Grafo
    if request.graph_id:
        graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == request.graph_id).first()
        graph_id = graph.id
    else:
        graph = KnowledgeGraph(title=request.title or "Nuevo Grafo", user_id=request.user_id)
        db.add(graph); db.commit(); db.refresh(graph)
        graph_id = graph.id
        user.graphs_created += 1; db.commit()

    # Construir Prompt
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    user_content = request.message
    if request.context:
        user_content += f"\n\nCONTEXTO ADICIONAL DEL ARCHIVO:\n{request.context[:3000]}"
    if request.previous_graph:
        user_content = f"Grafo Actual: {json.dumps(request.previous_graph)}\nInstrucción: {user_content}"
    
    messages.append({"role": "user", "content": user_content})

    # Llamada a IA
    try:
        completion = client.chat.completions.create(
            model="openai/gpt-oss-120b", 
            messages=messages, 
            temperature=0.7, 
            max_tokens=8000
        )
        json_str = completion.choices[0].message.content
        json_match = re.search(r'\{[\s\S]*\}', json_str)
        if not json_match: raise ValueError("Respuesta IA inválida")
        parsed_json = json.loads(json_match.group(0))
        
        # Guardar en DB
        restore_graph_from_json(db, graph_id, parsed_json, request.user_id)
        save_new_version(db, graph_id) # Snapshot para historial
        
        final_json = assemble_graph_json(graph_id, db)
        await broadcast_update(graph_id, final_json)
        
        return {"graph_id": graph_id, "graph": final_json}

    except Exception as e:
        raise HTTPException(500, f"Error generando grafo: {str(e)}")

@app.post("/expand_node")
async def expand_node(request: GraphRequest, db: Session = Depends(get_db)):
    request.previous_graph = assemble_graph_json(request.graph_id, db)
    if not request.message.startswith("Expandir:"): 
        request.message = f"Expandir: {request.message}"
    return await generate_graph(request, db)

@app.post("/refine_graph")
async def refine_graph(request: FeedbackRequest, db: Session = Depends(get_db)):
    prev_json = assemble_graph_json(request.graph_id, db)
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == request.graph_id).first()
    req = GraphRequest(
        message=request.feedback, previous_graph=prev_json,
        graph_id=request.graph_id, user_id=request.user_id, title=graph.title
    )
    return await generate_graph(req, db)

# 4. Edición Manual y Comentarios
@app.post("/delete_node")
async def delete_node(request: DeleteNodeRequest, db: Session = Depends(get_db)):
    db.query(GraphNode).filter(GraphNode.id == request.node_id, GraphNode.graph_id == request.graph_id).delete()
    db.commit()
    
    save_new_version(db, request.graph_id)
    final = assemble_graph_json(request.graph_id, db)
    await broadcast_update(request.graph_id, final)
    return {"graph": final}

@app.post("/add_comment")
async def add_comment(request: CommentRequest, db: Session = Depends(get_db)):
    node = db.query(GraphNode).filter(GraphNode.id == request.node_id).first()
    if not node: raise HTTPException(404, "Nodo no encontrado")
    
    comments = list(node.comments) if node.comments else []
    comments.append({"user_id": request.user_id, "text": request.text, "timestamp": str(uuid.uuid4())})
    node.comments = comments
    
    flag_modified(node, "comments") # Importante para SQLAlchemy JSON
    db.commit()
    
    save_new_version(db, request.graph_id)
    final = assemble_graph_json(request.graph_id, db)
    await broadcast_update(request.graph_id, final)
    return {"graph": final}

# 5. Historial, Navegación y Borrado
@app.get("/get_graph/{graph_id}")
async def get_graph(graph_id: str, db: Session = Depends(get_db)):
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == graph_id).first()
    if not graph: raise HTTPException(404, "Grafo no encontrado")
    
    data = assemble_graph_json(graph_id, db)
    
    # Calcular estado de historial
    can_undo, can_redo = False, False
    if graph.current_version_id:
        curr = db.query(GraphVersion).filter(GraphVersion.id == graph.current_version_id).first()
        if curr:
            prev = db.query(GraphVersion).filter(GraphVersion.graph_id == graph_id, GraphVersion.created_at < curr.created_at).first()
            nxt = db.query(GraphVersion).filter(GraphVersion.graph_id == graph_id, GraphVersion.created_at > curr.created_at).first()
            can_undo = prev is not None
            can_redo = nxt is not None
            
    return {"graph": data, "history": {"can_undo": can_undo, "can_redo": can_redo}}

@app.get("/graph_history/{user_id}")
async def graph_history(user_id: str, db: Session = Depends(get_db)):
    graphs = db.query(KnowledgeGraph).filter(KnowledgeGraph.user_id == user_id).all()
    return {"graphs": [{"id": g.id, "title": g.title} for g in graphs]}

@app.delete("/delete_graph/{graph_id}")
async def delete_graph(graph_id: str, user_id: str, db: Session = Depends(get_db)):
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == graph_id, KnowledgeGraph.user_id == user_id).first()
    if not graph: raise HTTPException(404, "Grafo no encontrado o no autorizado")
    db.delete(graph)
    db.commit()
    return {"status": "deleted"}

@app.post("/undo_graph/{graph_id}")
async def undo_graph(graph_id: str, db: Session = Depends(get_db)):
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == graph_id).first()
    if not graph.current_version_id: raise HTTPException(400, "Sin historial")
    
    curr = db.query(GraphVersion).filter(GraphVersion.id == graph.current_version_id).first()
    prev = db.query(GraphVersion).filter(
        GraphVersion.graph_id == graph_id, GraphVersion.created_at < curr.created_at
    ).order_by(desc(GraphVersion.created_at)).first()
    
    if prev:
        restore_graph_from_json(db, graph_id, prev.content, graph.user_id)
        graph.current_version_id = prev.id
        db.commit()
        final = assemble_graph_json(graph_id, db)
        await broadcast_update(graph_id, final)
        return {"graph": final}
    return {"error": "No more undo"}

@app.post("/redo_graph/{graph_id}")
async def redo_graph(graph_id: str, db: Session = Depends(get_db)):
    graph = db.query(KnowledgeGraph).filter(KnowledgeGraph.id == graph_id).first()
    curr = db.query(GraphVersion).filter(GraphVersion.id == graph.current_version_id).first()
    nxt = db.query(GraphVersion).filter(
        GraphVersion.graph_id == graph_id, GraphVersion.created_at > curr.created_at
    ).order_by(GraphVersion.created_at).first()
    
    if nxt:
        restore_graph_from_json(db, graph_id, nxt.content, graph.user_id)
        graph.current_version_id = nxt.id
        db.commit()
        final = assemble_graph_json(graph_id, db)
        await broadcast_update(graph_id, final)
        return {"graph": final}
    return {"error": "No more redo"}

# 6. Herramientas Extra (Quiz, Ayuda, Análisis, Exportar)
@app.post("/generate_quiz")
async def generate_quiz(request: QuizRequest, db: Session = Depends(get_db)):
    graph = assemble_graph_json(request.graph_id, db)
    if not graph["nodes"]: raise HTTPException(400, "Grafo vacío")
    
    nodes_text = ", ".join([n["label"] for n in graph["nodes"][:15]])
    prompt = f"""Basado en: {nodes_text}. Genera un JSON con 5 preguntas: {{ "questions": [ {{ "id": 1, "question": "...", "options": ["A","B","C","D"], "correctAnswer": "A" }} ] }}"""
    
    try:
        completion = client.chat.completions.create(
            model="openai/gpt-oss-120b", messages=[{"role":"user","content":prompt}], response_format={"type":"json_object"}
        )
        return json.loads(completion.choices[0].message.content)
    except Exception as e: raise HTTPException(500, f"Error Quiz: {str(e)}")

@app.post("/contextual_help")
async def contextual_help(request: GraphRequest):
    prompt = f"Ayuda breve para: {request.message}. Contexto grafo: {json.dumps(request.previous_graph)}"
    try:
        completion = client.chat.completions.create(model="openai/gpt-oss-120b", messages=[{"role":"user","content":prompt}], max_tokens=300)
        return {"help": completion.choices[0].message.content}
    except Exception as e: raise HTTPException(500, str(e))

@app.post("/analyze_graph")
async def analyze_graph(request: ExportRequest, db: Session = Depends(get_db)):
    data = assemble_graph_json(request.graph_id, db)
    G = nx.DiGraph()
    for n in data["nodes"]: G.add_node(n["id"], label=n["label"])
    for e in data["edges"]: G.add_edge(e["from"], e["to"])
    
    try:
        in_degree = nx.in_degree_centrality(G)
        labels = {nid: G.nodes[nid]["label"] for nid in G.nodes}
        readable_metrics = {labels[nid]: val for nid, val in in_degree.items()}
        return {"analytics": {"in_degree_centrality": readable_metrics}}
    except Exception as e: raise HTTPException(500, str(e))

@app.post("/export_graph")
async def export_graph(request: ExportRequest, db: Session = Depends(get_db)):
    return assemble_graph_json(request.graph_id, db)

# WebSocket
@app.websocket("/ws/{graph_id}")
async def websocket_endpoint(websocket: WebSocket, graph_id: str):
    await websocket.accept()
    collaborations[graph_id].append(websocket)
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        collaborations[graph_id].remove(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)