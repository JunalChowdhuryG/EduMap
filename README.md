# EduMap

> Transforma materiales educativos (textos, transcripciones de clases, documentos PDF) en diagramas interactivos de conceptos interrelacionados.

---

## 🚀 Instalación y ejecución

### 1. Levanta el backend

```bash
python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

### 2. Inicia el frontend

En **otra terminal**, en la carpeta raíz del proyecto:

```bash
npm install
npx update-browserslist-db@latest
npm run dev
```

### 3. Accede a la aplicación

Abre tu navegador y visita:

[http://localhost:5173/](http://localhost:5173/)
