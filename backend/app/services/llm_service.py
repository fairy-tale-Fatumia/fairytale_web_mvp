# backend/app/services/llm_service.py
import os, re, json
from openai import OpenAI, AsyncOpenAI
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# 이 파일(__file__)의 부모(parent)=services, 부모의 부모=app 디렉터리를 기준으로 prompts 폴더를 가리킵니다.
PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
STORY_PROMPT_PATH = PROMPTS_DIR / "story_img_pt2.txt"

with open(STORY_PROMPT_PATH, encoding="utf-8") as f:
    BASE_INSTRUCTIONS = f.read()

async def generate_story(prompt: str, previous_response_id: str | None = None, isStream = False):
    # 동기 호출(stream=False)
    params = {
        "model": "gpt-4.1",
        "instructions": BASE_INSTRUCTIONS,
        "input": prompt,
    }
    if previous_response_id:
        params["previous_response_id"] = previous_response_id
    if isStream:
        params["stream"] = isStream
    stream = await client.responses.create(**params)
    return stream

def parse_choices(output_text: str):
    # { "choices": [ ... ] } 블록만 추출
    m = re.search(r'{\s*"choices"\s*:\s*\[.*?\]\s*}', output_text, re.DOTALL)
    if not m:
        return []
    return json.loads(m.group())["choices"]

def extract_story_text(output_text: str):
    """
    출력물에서 선택지(choices) JSON 이전의 스토리 텍스트만 추출합니다.
    
    Args:
        output_text (str): 전체 출력 텍스트
        
    Returns:
        str: 추출된 스토리 텍스트
    """
    # choices JSON 패턴을 찾아 그 앞부분만 추출
    m = re.search(r'{\s*"choices"\s*:', output_text, re.DOTALL)
    if m:
        # choices JSON 시작 위치 이전의 텍스트를 반환
        return output_text[:m.start()].strip()
    # JSON 패턴이 없으면 전체 텍스트 반환
    return output_text.strip()

