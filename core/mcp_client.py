"""
medical-mcp 서버와 MCP 프로토콜(Streamable HTTP)로 통신하는 클라이언트.

- tool 목록·설명·파라미터 스키마는 MCP 서버의 tools/list 응답에서 자동으로 가져온다.
- MCP tool 은 async 전용이므로, 동기(WSGI) Django 에서 쓰기 위해 asyncio.run 으로 감싼다.
"""
import asyncio
import os

from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient

BASE_URL = os.getenv("BASE_URL", "http://localhost:3000")

_client = MultiServerMCPClient(
    {
        "medical": {
            "url": f"{BASE_URL}/mcp",
            "transport": "streamable_http",
        }
    }
)

_tools_cache: list[BaseTool] | None = None


def get_tools() -> list[BaseTool]:
    """MCP 서버에 등록된 tool 목록을 가져온다 (첫 호출 시 1회 조회 후 캐시)."""
    global _tools_cache
    if _tools_cache is None:
        _tools_cache = asyncio.run(_client.get_tools())
    return _tools_cache


def get_tool(name: str) -> BaseTool:
    tool_map = {t.name: t for t in get_tools()}
    if name not in tool_map:
        raise KeyError(f"MCP 서버에 '{name}' tool 이 없습니다. 사용 가능: {list(tool_map)}")
    return tool_map[name]


def _to_text(result) -> str:
    """MCP tool 결과(content block 리스트 또는 문자열)를 하나의 문자열로 합친다."""
    if isinstance(result, str):
        return result
    if isinstance(result, list):
        return "\n".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in result
        )
    return str(result)


def call_tool(name: str, args: dict) -> str:
    """MCP tool 을 동기적으로 호출하고 결과를 텍스트로 반환한다."""
    result = asyncio.run(get_tool(name).ainvoke(args))
    return _to_text(result)
