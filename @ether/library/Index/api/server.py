"""FastAPI app and uvicorn launcher."""
from __future__ import annotations

from ..config import DEFAULT_API_HOST, DEFAULT_API_PORT


def create_app():
    """Create the FastAPI application."""
    from fastapi import FastAPI
    from .routes import router

    app = FastAPI(
        title="Ether Code Index",
        description="Cross-language code search and comparison API",
        version="0.1.0",
    )
    app.include_router(router, prefix="/api")
    return app


def run(host: str = DEFAULT_API_HOST, port: int = DEFAULT_API_PORT):
    """Start the API server."""
    import uvicorn
    app = create_app()
    uvicorn.run(app, host=host, port=port)
