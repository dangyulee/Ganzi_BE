from langchain_upstage import ChatUpstage
from decouple import config

from .mcp_client import call_tool

from langgraph.graph import StateGraph
from langgraph.graph import END

from typing import TypedDict, Optional
import json
from langchain_core.messages import SystemMessage, HumanMessage

llm = ChatUpstage(api_key=config("upstage_key"), model="solar-pro2")

class MedicalState(TypedDict):
    disease_name: str
    drug_name: str
    disease_name_eng: str
    drug_name_eng: str
    disease_raw: Optional[str]
    drug_raw: Optional[str]
    result: Optional[dict]

graph_builder = StateGraph(MedicalState)

def start_node(state: MedicalState) -> MedicalState:
    disease_name_kor = state.get("disease_name")
    drug_name_kor = state.get("drug_name")
    
    system_prompt = """
    너는 의료 용어를 한국어에서 영어로 번역하는 전문 번역가이다.
    한국어 질병명과 약품명이 주어지면 아래 JSON 형태로만 출력해라:
    {
    "disease_name_eng": "영어 질병명",
    "drug_name_eng": "영어 약품명"
    }

    규칙:
    - 반드시 위 JSON 형식만 출력할 것
    - 영어 질병명/약품명은 의료적으로 자연스러운 용어로 번역할 것
    - JSON 형식 외의 다른 텍스트는 절대 출력하지 말 것
    """

    korean_input = {
        "disease_name_kor": disease_name_kor,
        "drug_name_kor": drug_name_kor
    }

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=json.dumps(korean_input, ensure_ascii=False)),
    ]

    resp = llm.invoke(messages)
    raw_text = resp.content.strip()

    try:
        data = json.loads(raw_text)
        english_disease = data.get("disease_name_eng",disease_name_kor)
        english_drug = data.get("drug_name_eng",drug_name_kor)
    except Exception:
        english_disease = None
        english_drug = None

    return {
        **state,
        "disease_name_eng": english_disease,
        "drug_name_eng": english_drug,
        "disease_raw": None,
        "drug_raw": None,
        "result": None,
    }

def disease_node(state: MedicalState) -> MedicalState:
    disease = state.get("disease_name_eng")
    if not disease:
        return state
    raw = call_tool("search-medical-databases", {"query": disease})
    return {**state, "disease_raw": raw}

def drug_node(state: MedicalState) -> MedicalState:
    drug = state.get("drug_name_eng")
    if not drug:
        return state
    raw = call_tool("search-drugs", {"query": drug})
    return {**state, "drug_raw": raw}

def generate(state: MedicalState):    
    system_prompt = """
    너는 의료 정보를 일반인이 이해하기 쉽게 요약해 주는 한국어 헬스케어 도우미이다.

    - disease_raw / drug_raw 에 정보가 있으면 그것을 참고해라.
    - disease_raw / drug_raw 에 없는 내용은 모델의 일반 지식을 사용해 보완해도 된다.

    다음 JSON 형식으로만 출력해라:
    {
    "disease_info": "disease_name에 대한 사람 친화적인 설명",
    "drug_info": "drug_name에 대한 사람 친화적인 설명",
    "health_tip": "생활습관, 주의사항 등에 대한 간단한 조언"
    }

    요구사항:
    - 반드시 위와 같은 키 3개(disease_info, drug_info, health_tip)를 모두 포함한 유효한 JSON만 출력할 것
    - 설명은 모두 한국어로 작성(용어도 최대한 번역해줘)
    - disease_info에는 질병의 개요, 주요 증상을 1~2문장 이내로 요약
    - drug_info에는 약의 성분, 용도, 주의사항을 1~2문장 이내로 요약
    - health_tip에는 질병에 대한 생활습관(식단/운동/수면 등), 간단한 치료/관리 내용을 4~6문장 정도로 작성
    - JSON 바깥에 다른 텍스트(설명, 마크다운 등)는 절대 쓰지 말 것
    - 맨앞에 json 출력하지마
    """

    user_content = {
        "disease_name" : state.get("disease_name"),
        "drug_name" : state.get("drug_name"),
        "disease_raw" : state.get("disease_raw"),
        "drug_raw" : state.get("drug_raw")
    }

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=json.dumps(user_content, ensure_ascii=False)),
    ]

    resp = llm.invoke(messages)
    raw_text = resp.content.strip()

    try:
        data = json.loads(raw_text)
    except Exception:
        raise ValueError(
            "LLM 응답(JSON) 파싱 실패: 모델이 JSON 형식을 지키지 않았습니다. "
            "다시 시도해 주세요."
            "{raw_text}"
        )

    disease_summary = data.get("disease_info", "")
    drug_summary = data.get("drug_info", "")
    health_tip = data.get("health_tip", "")

    result = {
        "disease_info": disease_summary,
        "drug_info": drug_summary,
        "health_tip": health_tip,
    }

    return {
        **state,
        "result": result,
    }

graph_builder.add_node(start_node)
graph_builder.add_node(disease_node)
graph_builder.add_node(drug_node)
graph_builder.add_node(generate)

graph_builder.set_entry_point("start_node")
graph_builder.add_edge("start_node", "disease_node")
graph_builder.add_edge("disease_node", "drug_node")
graph_builder.add_edge("drug_node","generate")
graph_builder.add_edge("generate", END)

graph = graph_builder.compile()