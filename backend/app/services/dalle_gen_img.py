import re
import os
from typing import Optional, Dict, Any
from openai import OpenAI
from dotenv import load_dotenv
import base64

# 환경 변수 로드
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

PREFIX = (
    "img:"
)

def extract_dalle_prompt(response: str, *, strict: bool = True) -> Optional[str]:
    """
    Extract the single‑line DALL·E 3 prompt from a full assistant response.

    Parameters
    ----------
    response : str
        The full text returned by the story‑writer agent.
    strict : bool, optional
        * If True (default) → raise ValueError when prompt is not found.
        * If False → return None when prompt is not found.

    Returns
    -------
    str | None
        The exact prompt line (including the fixed PREFIX) or None.
    """
    # 1) 코드 블록(``` ... ```) 안에 들어 있을 수도 있으니 제거
    #    → 백틱 3개로 감싼 구간을 모두 날려 버림
    cleaned = re.sub(r"```.*?```", "", response, flags=re.S)

    # 2) 줄 단위 탐색 (공백·MD 표시 |> 등 제거)
    for raw_line in cleaned.splitlines():
        line = raw_line.strip(" >")  # Markdown 인용 '> ', 공백 제거
        if line.lower().startswith(PREFIX):
            pt = line[len(PREFIX):].strip()
            print(f"extract_prompt: {pt}")
            # PREFIX를 제외한 부분만 반환
            return pt

    if strict:
        raise ValueError("DALL·E prompt line not found in the response.")
    return None

def generate_image(
    prompt: str,
    model: str = "gpt-image-1",
    moderation : str = "low",
    output_format: str = "png",
    quality: str = "high",
    size: str = "1024x1024",
    n: int = 1
) -> Dict[str, Any]:
    """
    OpenAI API를 사용하여 이미지를 생성합니다.
    
    Parameters
    ----------
    prompt : str
        이미지 생성을 위한 프롬프트
    model : str
        사용할 모델 ('dall-e-2' 또는 'dall-e-3')
    style : str
        이미지 스타일 ('natural' 또는 'vivid')
    quality : str
        이미지 품질 ('standard' 또는 'hd')
    size : str
        이미지 크기 (dall-e-3: '1024x1024', '1792x1024', '1024x1792')
    n : int
        생성할 이미지 수 (dall-e-3은 1만 지원)
        
    Returns
    -------
    Dict[str, Any]
        생성된 이미지 정보가 포함된 딕셔너리
        - image_url: 이미지 URL
        - prompt: 사용된 프롬프트
        - model: 사용된 모델
    """
    try:
        response = client.images.generate(
            prompt=prompt,
            model=model,
            n=n,
            size=size,
            quality=quality,
            output_format=output_format,
            moderation=moderation,
        )
        
        # 응답 결과 반환
        return {
            "image_bytes": base64.b64decode(response.data[0].b64_json),
            "prompt": prompt,
            "model": model,
            "quality": quality,
            "size": size,
            "output_format": output_format,
            "moderation": moderation
        }
    
    except Exception as e:
        # 오류 처리
        raise Exception(f"이미지 생성 중 오류 발생: {str(e)}")

async def generate_and_save_image(prompt: str, storage_key: str = None, **kwargs) -> Dict[str, Any]:
    """
    이미지를 생성하고 필요시 스토리지에 저장하는 비동기 함수
    
    Parameters
    ----------
    prompt : str
        이미지 생성을 위한 프롬프트
    storage_key : str, optional
        스토리지에 저장할 때 사용할 키
    **kwargs
        generate_image 함수에 전달할 추가 인자
        
    Returns
    -------
    Dict[str, Any]
        생성 및 저장 결과
    """
    # 이미지 생성
    return generate_image(prompt, **kwargs)

def create_image_edit(prompt: str, image_bytes: str):

    result = client.images.edit(
    model="gpt-image-1",
    image=image_bytes,
    prompt=prompt
    )

    image_base64 = result.data[0].b64_json
    image_bytes = base64.b64decode(image_base64)

    return image_bytes