"""Enterprise AI Copilot Service.

Provides real-time, context-aware LLM assistance for the ML Playground.
Supports Google Gemini, Groq, OpenAI, and Local Ollama via standard asynchronous HTTP.
Dynamically injects active Python code, dataset schema, and terminal error tracebacks.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional
import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class CopilotService:
    @classmethod
    def get_provider_and_key(cls) -> tuple[str, str, str, str]:
        """Resolve AI provider, API key, model, and base URL from environment/settings."""
        provider = (
            getattr(settings, "ai_copilot_provider", "")
            or os.environ.get("AI_COPILOT_PROVIDER", "")
            or ""
        ).strip().lower()

        gemini_key = os.environ.get("GEMINI_API_KEY") or getattr(settings, "gemini_api_key", "")
        groq_key = os.environ.get("GROQ_API_KEY") or getattr(settings, "groq_api_key", "")
        openai_key = os.environ.get("OPENAI_API_KEY") or getattr(settings, "openai_api_key", "")
        custom_key = os.environ.get("AI_COPILOT_API_KEY") or getattr(settings, "ai_copilot_api_key", "")
        model = os.environ.get("AI_COPILOT_MODEL") or getattr(settings, "ai_copilot_model", "")
        base_url = os.environ.get("AI_COPILOT_BASE_URL") or getattr(settings, "ai_copilot_base_url", "")

        # Auto-detect if provider not explicitly set
        if not provider:
            if gemini_key:
                provider = "gemini"
            elif groq_key:
                provider = "groq"
            elif openai_key:
                provider = "openai"
            elif custom_key:
                provider = "custom"
            else:
                provider = "gemini"  # Default target

        # Resolve key and default model based on provider
        api_key = custom_key
        if provider == "gemini":
            api_key = api_key or gemini_key
            model = model or "gemini-1.5-flash"
        elif provider == "groq":
            api_key = api_key or groq_key
            model = model or "llama-3.3-70b-versatile"
            base_url = base_url or "https://api.groq.com/openai/v1"
        elif provider == "openai":
            api_key = api_key or openai_key
            model = model or "gpt-4o-mini"
            base_url = base_url or "https://api.openai.com/v1"
        elif provider == "ollama":
            model = model or "qwen2.5-coder:7b"
            base_url = base_url or "http://localhost:11434/v1"

        return provider, api_key, model, base_url

    @classmethod
    def get_status(cls) -> Dict[str, Any]:
        """Return readiness status of the AI Copilot."""
        provider, api_key, model, base_url = cls.get_provider_and_key()
        is_configured = bool(api_key or provider == "ollama")
        return {
            "configured": is_configured,
            "provider": provider,
            "model": model,
            "requires_key": provider != "ollama",
        }

    @classmethod
    async def generate_response(
        cls,
        prompt: str,
        code_context: Optional[str] = None,
        dataset_name: Optional[str] = None,
        dataset_schema: Optional[Dict[str, Any]] = None,
        error_traceback: Optional[str] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
        policy: str = "full",
    ) -> Dict[str, Any]:
        """Generate real-time AI response using configured LLM provider."""
        provider, api_key, model, base_url = cls.get_provider_and_key()

        if not api_key and provider != "ollama":
            return {
                "reply": (
                    "⚠️ **[AI Copilot Not Configured]**\n\n"
                    "To enable real-time AI responses, please configure an API key in your environment:\n\n"
                    "• **Google Gemini:** Set `GEMINI_API_KEY` in `.env` (Recommended, free tier available)\n"
                    "• **Groq:** Set `GROQ_API_KEY` in `.env` (Fast Llama-3.3 inference)\n"
                    "• **OpenAI:** Set `OPENAI_API_KEY` in `.env` (`gpt-4o-mini`)\n"
                    "• **Local Ollama:** Set `AI_COPILOT_PROVIDER=ollama` and run Ollama locally.\n\n"
                    "No hardcoded questions or static templates are stored on this platform."
                ),
                "provider": provider,
                "model": model,
                "allowed": True,
                "configured": False,
            }

        # Build context-rich system prompt
        system_instructions = (
            "You are Antigravity ML Copilot, an enterprise-grade AI data science & MLOps pair-programmer "
            "embedded in the ML Playground workbench. You assist with scikit-learn pipelines, model training, "
            "feature engineering, metrics interpretation, hyperparameter tuning, and error resolution.\n\n"
            "Guidelines:\n"
            "1. Answer concisely, technically, and accurately.\n"
            "2. When writing Python code, use idiomatic scikit-learn, pandas, and numpy.\n"
            "3. Refer directly to the user's active code, dataset columns, and errors if provided.\n"
        )

        if policy == "explain-only":
            system_instructions += (
                "\n[Policy Restriction: Explain-Only Mode]\n"
                "The instructor has set Explain-Only mode. Explain ML concepts, math, logic, and debugging hints, "
                "but DO NOT provide full copy-paste solutions or write complete pipelines for the student."
            )

        context_blocks: List[str] = []
        if dataset_name:
            context_blocks.append(f"Active Dataset: {dataset_name}")
        if dataset_schema:
            context_blocks.append(f"Dataset Schema / Features: {dataset_schema}")
        if code_context and code_context.strip():
            snippet = code_context.strip()
            if len(snippet) > 4000:
                snippet = snippet[:4000] + "\n# ... [truncated]"
            context_blocks.append(f"Current Code in Studio:\n```python\n{snippet}\n```")
        if error_traceback and error_traceback.strip():
            context_blocks.append(f"Recent Execution Error Traceback:\n```\n{error_traceback.strip()}\n```")

        context_text = "\n\n".join(context_blocks)
        if context_text:
            system_instructions += f"\n\n--- Active Studio Context ---\n{context_text}"

        try:
            if provider == "gemini":
                return await cls._call_gemini(api_key, model, system_instructions, prompt, chat_history)
            elif provider in ("openai", "groq", "ollama", "custom"):
                return await cls._call_openai_compatible(
                    api_key, model, base_url, system_instructions, prompt, chat_history, provider
                )
            else:
                return await cls._call_gemini(api_key, model, system_instructions, prompt, chat_history)
        except Exception as exc:
            logger.exception("AI Copilot request failed: %s", exc)
            return {
                "reply": f"❌ **[Copilot Connection Error]**\n\nFailed to reach AI provider `{provider}`: {str(exc)}",
                "provider": provider,
                "model": model,
                "allowed": True,
                "configured": True,
                "error": str(exc),
            }

    @classmethod
    async def _call_gemini(
        cls,
        api_key: str,
        model: str,
        system_instruction: str,
        prompt: str,
        chat_history: Optional[List[Dict[str, str]]],
    ) -> Dict[str, Any]:
        """Invoke Google Gemini REST API using httpx."""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

        contents: List[Dict[str, Any]] = []

        # Add past turns if available
        if chat_history:
            for msg in chat_history[-6:]:
                role = "user" if msg.get("role") == "user" else "model"
                text = msg.get("text", "")
                if text:
                    contents.append({"role": role, "parts": [{"text": text}]})

        # Add current user prompt
        contents.append({"role": "user", "parts": [{"text": prompt}]})

        payload = {
            "systemInstruction": {"parts": [{"text": system_instruction}]},
            "contents": contents,
            "generationConfig": {
                "temperature": 0.4,
                "maxOutputTokens": 2048,
            },
        }

        async with httpx.AsyncClient(timeout=35.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                err_detail = resp.text
                try:
                    err_json = resp.json()
                    err_detail = err_json.get("error", {}).get("message", err_detail)
                except Exception:
                    pass
                raise RuntimeError(f"Gemini API returned HTTP {resp.status_code}: {err_detail}")

            data = resp.json()
            candidates = data.get("candidates", [])
            if not candidates:
                return {
                    "reply": "No response returned from Gemini.",
                    "provider": "gemini",
                    "model": model,
                    "allowed": True,
                    "configured": True,
                }

            text_parts = candidates[0].get("content", {}).get("parts", [])
            reply = "".join(p.get("text", "") for p in text_parts)
            return {
                "reply": reply or "Received empty response from Gemini.",
                "provider": "gemini",
                "model": model,
                "allowed": True,
                "configured": True,
            }

    @classmethod
    async def _call_openai_compatible(
        cls,
        api_key: str,
        model: str,
        base_url: str,
        system_instruction: str,
        prompt: str,
        chat_history: Optional[List[Dict[str, str]]],
        provider: str,
    ) -> Dict[str, Any]:
        """Invoke OpenAI / Groq / Ollama / Custom compatible endpoint."""
        endpoint = f"{base_url.rstrip('/')}/chat/completions"
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        messages = [{"role": "system", "content": system_instruction}]

        if chat_history:
            for msg in chat_history[-6:]:
                role = "user" if msg.get("role") == "user" else "assistant"
                text = msg.get("text", "")
                if text:
                    messages.append({"role": role, "content": text})

        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.4,
            "max_tokens": 2048,
        }

        async with httpx.AsyncClient(timeout=35.0) as client:
            resp = await client.post(endpoint, json=payload, headers=headers)
            if resp.status_code != 200:
                err_detail = resp.text
                try:
                    err_json = resp.json()
                    err_detail = err_json.get("error", {}).get("message", err_detail)
                except Exception:
                    pass
                raise RuntimeError(f"{provider.capitalize()} API returned HTTP {resp.status_code}: {err_detail}")

            data = resp.json()
            choices = data.get("choices", [])
            if not choices:
                return {
                    "reply": f"No response choices returned from {provider}.",
                    "provider": provider,
                    "model": model,
                    "allowed": True,
                    "configured": True,
                }

            reply = choices[0].get("message", {}).get("content", "")
            return {
                "reply": reply or "Received empty response.",
                "provider": provider,
                "model": model,
                "allowed": True,
                "configured": True,
            }
