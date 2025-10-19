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
import networkx as nx # Importar networkx para RF09

# Configuración de la base de datos
DATABASE_URL = "sqlite:///./knowledge_graphs.db"
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False} # Soluciona error de threading de SQLite
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Modelos de la base de datos (sin cambios)
class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    persona_type = Column(String, nullable=True) 
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

# Dependencia para DB
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Cliente Groq
client = Groq(api_key="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")

# --- MODIFICADO: SYSTEM_PROMPT ---
# Añadida instrucción de color para jerarquía
SYSTEM_PROMPT = """
Eres un generador de mapas de conocimiento para materiales educativos. Tu tarea es crear, refinar o expandir un grafo basado en el texto proporcionado.

*** IMPORTANTE: Todas las etiquetas (labels) y descripciones (descriptions) en tu respuesta DEBEN estar en ESPAÑOL. ***

Cada nodo debe incluir:
1.  "id": Un ID único (ej: "concepto_1").
2.  "label": El nombre del concepto en español.
3.  "type": El tipo de nodo (ej: 'concepto_principal', 'concepto_secundario', 'entidad', 'detalle').
4.  "description": Una breve descripción en español.
5.  "color": Asigna un color hexadecimal para indicar la jerarquía. Usa colores brillantes.
    * '#FFB347' (Naranja) para Conceptos Principales (los más importantes).
    * '#77DD77' (Verde) para Conceptos Secundarios.
    * '#AEC6CF' (Azul Pálido) para Entidades (Personas, Lugares, Fechas).
    * '#B39EB5' (Lila) para Detalles o ejemplos específicos.
6.  "comments": Un array vacío, `[]`.

Para expansión (RF03): Si el mensaje del usuario comienza con "Expandir:", enfócate en el nodo especificado. El LLM debe proveer más información si la del usuario es insuficiente, generando nuevos nodos y relaciones.

Responde ÚNICAMENTE con un objeto JSON válido en el siguiente formato, sin texto adicional:
{
  "nodes": [
    {"id": "id_unico", "label": "Etiqueta del Nodo", "type": "concepto_principal", "description": "Descripción...", "color": "#FFB347", "comments": []}
  ],
  "edges": [
    {"from": "id_origen", "to": "id_destino", "label": "Etiqueta de la Relación"}
  ]
}
"""

app = FastAPI()

# CORS (con orígenes explícitos)
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
collaborations: Dict[str, List[WebSocket]] = defaultdict(list)
# ... (Clases Pydantic: GraphRequest, FeedbackRequest, etc. - sin cambios) ...
class GraphRequest(BaseModel):
    message: str
    previous_graph: Optional[Dict] = None
    graph_id: Optional[str] = None
    title: Optional[str] = None
    user_id: str

class FeedbackRequest(BaseModel):
    feedback: str
    graph_id: str
    user_id: str

class ExportRequest(BaseModel):
    graph_id: str
    format: str # 'json' o 'png'

class UserRequest(BaseModel):
    user_id: Optional[str] = None
    persona_type: Optional[str] = None

class PreferenceRequest(BaseModel):
    content: Dict
    user_id: str

class CommentRequest(BaseModel):
    graph_id: str
    node_id: str
    text: str
    user_id: str
# ... (Endpoints: /create_user, /upload - sin cambios) ...

@app.post("/create_user")
async def create_user(request: UserRequest, db: Session = Depends(get_db)):
    if request.user_id:
        user = db.query(User).filter(User.id == request.user_id).first()
        if user:
            if request.persona_type:
                user.persona_type = request.persona_type
                db.commit()
            return {"user_id": user.id}
    new_user = User(persona_type=request.persona_type)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"user_id": new_user.id}

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        if file.filename.endswith('.pdf'):
            pdf_reader = PyPDF2.PdfReader(file.file)
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
            return {"extracted_text": text, "notification": None}
        elif file.filename.endswith('.txt'):
            text = await file.read()
            return {"extracted_text": text.decode('utf-8'), "notification": None}
        elif file.filename.endswith(('.wav', '.mp3')):  # Audio
            r = sr.Recognizer()
            with sr.AudioFile(file.file) as source:
                audio = r.record(source)
            text = r.recognize_google(audio, language="es-ES") # Asumimos español
            return {"extracted_text": text, "notification": None}
        elif file.filename.endswith(('.png', '.jpg', '.jpeg')):  # Imagen con OCR
            image = Image.open(file.file)
            text = pytesseract.image_to_string(image, lang='spa') # Asumimos español
            return {"extracted_text": text, "notification": None}
        else:
            raise HTTPException(status_code=400, detail="Tipo de archivo no soportado")
    except Exception as e:
        return {"extracted_text": None, "notification": f"Error en procesamiento: {str(e)}."}


@app.post("/generate_graph")
async def generate_graph(request: GraphRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    graph_id = request.graph_id or str(uuid.uuid4())
    
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if request.previous_graph:
        user_content = f"Grafo Anterior: {json.dumps(request.previous_graph)}\n\nInstrucción del Usuario: {request.message}"
    else:
        user_content = request.message
    messages.append({"role": "user", "content": user_content})
    
    try:
        completion = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=messages,
            temperature=0.7,
            max_tokens=8000,
            max_completion_tokens=8192,
            top_p=1,
            stream=False,
        )
        
        json_response = completion.choices[0].message.content
        
        # --- MODIFICADO: Manejo de JSON Inválido ---
        json_match = re.search(r'\{[\s\S]*\}', json_response)
        if not json_match:
            # Si la IA no devuelve JSON (ej. error, rate limit), lanzamos un error claro
            raise HTTPException(status_code=500, detail=f"La respuesta de la IA no contenía JSON. Respuesta: {json_response}")
        
        json_str = json_match.group(0)
        parsed_json = json.loads(json_str)
        
        if not isinstance(parsed_json, dict) or "nodes" not in parsed_json or "edges" not in parsed_json:
            raise ValueError("Estructura de grafo inválida")
        
        # Almacenar o actualizar en DB
        graph = db.query(Graph).filter(Graph.id == graph_id).first()
        if graph:
            graph.content = parsed_json
            graph.title = request.title if request.title else graph.title
        else:
            graph = Graph(id=graph_id, content=parsed_json, title=request.title, user_id=request.user_id)
            db.add(graph)
        db.commit()
        db.refresh(graph)
        
        await broadcast_update(graph_id, parsed_json)
        
        return {"graph_id": graph_id, "graph": parsed_json}
    
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"JSON inválido: {e}. Respuesta recibida: {json_str[:200]}...")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.post("/expand_node")
async def expand_node(request: GraphRequest, db: Session = Depends(get_db)):
    """
    RF03: Expande un nodo específico.
    """
    if not request.graph_id:
        raise HTTPException(status_code=400, detail="graph_id requerido")
    
    graph = db.query(Graph).filter(Graph.id == request.graph_id, Graph.user_id == request.user_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Grafo no encontrado")
    
    request.previous_graph = graph.content
    
    # Aseguramos que el mensaje sea interpretado como una expansión
    if not request.message.startswith("Expandir:"):
        request.message = f"Expandir: {request.message}"

    response = await generate_graph(request, db)
    
    await broadcast_update(request.graph_id, response["graph"])
    
    return response

@app.post("/refine_graph")
async def refine_graph(request: FeedbackRequest, db: Session = Depends(get_db)):
    """
    RF04: Refina el grafo basado en retroalimentación del usuario.
    """
    graph = db.query(Graph).filter(Graph.id == request.graph_id, Graph.user_id == request.user_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Grafo no encontrado")
    
    refine_request = GraphRequest(
        message=request.feedback,
        previous_graph=graph.content,
        graph_id=request.graph_id,
        user_id=request.user_id
    )
    response = await generate_graph(refine_request, db)
    
    await broadcast_update(request.graph_id, response["graph"])
    
    return response

# ... (Endpoints: /export_graph, /graph_history, /get_graph - sin cambios) ...
@app.post("/export_graph")
async def export_graph(request: ExportRequest, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == request.graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Grafo no encontrado")
    
    if request.format == 'json':
        return graph.content
    else:
        raise HTTPException(status_code=400, detail="Formato no soportado. Soportados: json")

@app.get("/graph_history/{user_id}")
async def graph_history(user_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    graphs_list = [{"id": g.id, "title": g.title} for g in user.graphs]
    return {"graphs": graphs_list}

@app.get("/get_graph/{graph_id}")
async def get_graph(graph_id: str, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Grafo no encontrado")
    return {"graph": graph.content}

# ... (WebSocket - sin cambios) ...
@app.websocket("/ws/{graph_id}")
async def websocket_endpoint(websocket: WebSocket, graph_id: str, db: Session = Depends(get_db)):
    await websocket.accept()
    if not db.query(Graph).filter(Graph.id == graph_id).first():
        await websocket.close(code=1008)
        return
    
    collaborations[graph_id].append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                update = json.loads(data)
                if update.get("type") == "edit":
                    graph = db.query(Graph).filter(Graph.id == graph_id).first()
                    graph.content = update["graph"]
                    db.commit()
                    await broadcast_update(graph_id, update["graph"])
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        collaborations[graph_id].remove(websocket)

async def broadcast_update(graph_id: str, graph: Dict):
    for connection in collaborations[graph_id]:
        await connection.send_json({"type": "update", "graph": graph})

# ... (Endpoints: /contextual_help - sin cambios) ...
@app.post("/contextual_help")
async def contextual_help(request: GraphRequest, db: Session = Depends(get_db)):
    help_prompt = f"Proporciona sugerencias contextuales o tutorial para: {request.message}\nBasado en grafo: {json.dumps(request.previous_graph)}"
    messages = [{"role": "system", "content": "Eres un asistente útil para grafos de conocimiento."}, {"role": "user", "content": help_prompt}]
    
    completion = client.chat.completions.create(
        model="llama3-70b-8192",
        messages=messages,
        temperature=0.7,
        max_tokens=1024,
    )
    return {"help": completion.choices[0].message.content}

# ... (Endpoint: /analyze_graph (RF09) - sin cambios) ...
@app.post("/analyze_graph")
async def analyze_graph(request: ExportRequest, db: Session = Depends(get_db)):
    graph_data = db.query(Graph).filter(Graph.id == request.graph_id).first()
    if not graph_data:
        raise HTTPException(status_code=404, detail="Grafo no encontrado")
    
    G = nx.Graph()
    for node in graph_data.content["nodes"]:
        G.add_node(node["id"], label=node["label"])
    for edge in graph_data.content["edges"]:
        G.add_edge(edge["from"], edge["to"], label=edge["label"])
    
    centrality = nx.degree_centrality(G)
    # Convertir a un formato más amigable (mapear ID a label)
    label_centrality = {G.nodes[node_id]['label']: value for node_id, value in centrality.items()}
    
    return {"analytics": {"centrality": label_centrality}}

# ... (Endpoints: /update_preferences, /get_preferences, /add_comment - sin cambios) ...
@app.post("/update_preferences")
async def update_preferences(request: PreferenceRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    pref = db.query(Preference).filter(Preference.user_id == request.user_id).first()
    if pref:
        pref.content = request.content
    else:
        pref = Preference(content=request.content, user_id=request.user_id)
        db.add(pref)
    db.commit()
    return {"preferences": pref.content}

@app.get("/get_preferences/{user_id}")
async def get_preferences(user_id: str, db: Session = Depends(get_db)):
    pref = db.query(Preference).filter(Preference.user_id == user_id).first()
    if not pref:
        return {"preferences": {}}
    return {"preferences": pref.content}

@app.post("/add_comment")
async def add_comment(request: CommentRequest, db: Session = Depends(get_db)):
    graph = db.query(Graph).filter(Graph.id == request.graph_id).first()
    if not graph:
        raise HTTPException(status_code=404, detail="Grafo no encontrado")
    
    for node in graph.content["nodes"]:
        if node["id"] == request.node_id:
            if "comments" not in node:
                node["comments"] = []
            node["comments"].append({
                "user_id": request.user_id,
                "text": request.text,
                "timestamp": str(uuid.uuid4()) # Placeholder
            })
            break
    else:
        raise HTTPException(status_code=404, detail="Nodo no encontrado")
    
    db.commit()
    await broadcast_update(request.graph_id, graph.content)
    return {"graph": graph.content}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)