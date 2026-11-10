from langchain_upstage import ChatUpstage
from decouple import config

from .mcp_client import get_tools, call_tool

llm = ChatUpstage(api_key=config("upstage_key"), model="solar-pro2")

def ai_answer(question):
    # MCP 서버에서 tool 목록·스키마를 자동으로 받아와 LLM 에 바인딩
    tools = get_tools()
    llm_with_tools = llm.bind_tools(tools)

    messages = [{"role": "system", "content": "질병 혹은 약에 관해서는 최대한 tool을 사용하고, 질병 혹은 약에 해당하는 한 단어만 영어로 번역해서 query로 전달해줘. 대신 답변은 한국어로"},
        {"role": "user", "content": question}]
    response = llm_with_tools.invoke(messages)

    if response.tool_calls:
        tool_call = response.tool_calls[0]
        tool_name = tool_call["name"]
        tool_args = tool_call["args"]

        # MCP 서버에 tool 실행 요청 (tools/call)
        tool_result = call_tool(tool_name, tool_args)

        summary = llm.invoke([
            {"role": "system", "content": "질문에 맞게 5줄 이내로 한국어로 정리해줘. 검색결과가 없거나 부족하면 추가자료를 찾아줘"},
            {"role": "user", "content": "question: " + question + "tool_result: " + str(tool_result)}
        ])

        return {
            "mode": "tool_call",
            "tool": tool_name,
            "args": tool_args,
            "tool_resut" : tool_result,
            "result": summary.content,
        }
    return {
        "mode": "llm_response",
        "result": response.content,
    }