from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse, Response

from app.schemas.story import StoryRequest, StoryResponse, Choice
from app.services.llm_service import generate_story, parse_choices, extract_story_text
from app.services.dalle_gen_img import extract_dalle_prompt, generate_image, create_image_edit

import asyncio
from functools import partial
import json
import logging
import base64
import os
from typing import Optional, Dict
from pathlib import Path

from openai import OpenAIError

import redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)

# Redis 클라이언트 설정
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

# Redis 연결
try:
    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        password=REDIS_PASSWORD,
        decode_responses=False,  # 바이너리 데이터를 위해 False로 설정
    )
    # 연결 테스트
    redis_client.ping()
    logger.info("Redis 연결 성공")
except RedisError as e:
    logger.error(f"Redis 연결 실패: {str(e)}")
    # Redis가 없어도 작동할 수 있도록 None으로 설정
    redis_client = None

# Redis 키 설정 (TTL: 1일 = 86400초)
IMAGE_EXPIRY = 86400
IMAGE_KEY_PREFIX = "image:"
FIRST_IMAGE_KEY_PREFIX = "first_image:"

router = APIRouter(tags=["story"])

# 임시 이미지 디렉토리 (Redis 실패 시 대체용)
TEMP_IMAGE_DIR = Path("temp_images")
TEMP_IMAGE_DIR.mkdir(exist_ok=True)

# Redis 헬퍼 함수
def store_image(user_id: str, response_id: str, image_bytes: bytes) -> bool:
    """Redis에 이미지 저장"""
    if not redis_client:
        return False
        
    try:
        key = f"{IMAGE_KEY_PREFIX}{user_id}:{response_id}"
        redis_client.set(key, image_bytes, ex=IMAGE_EXPIRY)
        return True
    except RedisError as e:
        logger.error(f"Redis 이미지 저장 실패: {str(e)}")
        return False

def get_image(user_id: str, response_id: str) -> Optional[bytes]:
    """Redis에서 이미지 조회"""
    if not redis_client:
        return None
        
    try:
        key = f"{IMAGE_KEY_PREFIX}{user_id}:{response_id}"
        return redis_client.get(key)
    except RedisError as e:
        logger.error(f"Redis 이미지 조회 실패: {str(e)}")
        return None

def store_first_image_id(user_id: str, response_id: str) -> bool:
    """사용자의 첫 번째 이미지 ID 저장"""
    if not redis_client:
        return False
        
    try:
        key = f"{FIRST_IMAGE_KEY_PREFIX}{user_id}"
        # 이미 존재하는 경우에는 설정하지 않음 (첫 번째 이미지만 기록)
        if not redis_client.exists(key):
            redis_client.set(key, response_id, ex=IMAGE_EXPIRY)
        return True
    except RedisError as e:
        logger.error(f"Redis 첫 번째 이미지 ID 저장 실패: {str(e)}")
        return False

def get_first_image_id(user_id: str) -> Optional[str]:
    """사용자의 첫 번째 이미지 ID 조회"""
    if not redis_client:
        return None
        
    try:
        key = f"{FIRST_IMAGE_KEY_PREFIX}{user_id}"
        result = redis_client.get(key)
        if result:
            return result.decode('utf-8')
        return None
    except RedisError as e:
        logger.error(f"Redis 첫 번째 이미지 ID 조회 실패: {str(e)}")
        return None

# ---------------------------------------------------------------------------
#  POST /api/v1/story  – 비동기 한 방(스트림 아님) 스토리 생성
# ---------------------------------------------------------------------------

#사용안함
# @router.post("/", response_model=StoryResponse)
# async def create_story(request: StoryRequest):
#     """LLM으로 전체 스토리를 한 번에 받아오는 엔드포인트."""

#     try:
#         # ────────────────────────────────────────────────────────────────
#         # 1)  LLM 호출 (비스트림)
#         # ────────────────────────────────────────────────────────────────
#         raw = await generate_story(request.prompt, request.previous_response_id, False)
#         output_text: str = raw.choices[0].message.content

#         # ────────────────────────────────────────────────────────────────
#         # 2)  스토리 후처리
#         # ────────────────────────────────────────────────────────────────
#         choices = [Choice(**c) for c in parse_choices(output_text)]
#         response = StoryResponse(text=output_text, choices=choices, response_id=raw.id)

#         # ────────────────────────────────────────────────────────────────
#         # 3)  선택형: DALL·E  이미지 생성 (CPU block ⇒ executor)
#         # ────────────────────────────────────────────────────────────────
#         image_prompt = extract_dalle_prompt(output_text)
#         if image_prompt:
#             loop = asyncio.get_running_loop()
#             img_result = await loop.run_in_executor(
#                 None,
#                 partial(
#                     generate_image,
#                     prompt=image_prompt,
#                     model="gpt-image-1",
#                     output_format="png",
#                     moderation="low",
#                     quality="high",
#                     size="512x512",
#                 ),
#             )
#             response.image_bytes = img_result["image_bytes"]

#         return response

#     except OpenAIError as oe:
#         logger.error("LLM 서비스 호출 실패", exc_info=oe)
#         raise HTTPException(status_code=502, detail="LLM 서비스 호출 실패")
#     except Exception:
#         logger.exception("스토리 생성 중 예기치 않은 오류")
#         raise HTTPException(status_code=500, detail="서버 내부 오류")


# ---------------------------------------------------------------------------
#  GET /api/v1/story/stream_sse  – SSE 스트리밍
# ---------------------------------------------------------------------------

@router.get("/stream_sse")
async def create_story_sse(prompt: str, previous_response_id: Optional[str] = None, user_session_id: Optional[str] = None):

    async def event_generator():
        full_response_text: str = ""
        story_text: str = ""
        response_id: Optional[str] = None
        image_url: Optional[str] = None
        is_story_part: bool = True  # 스토리 부분인지 여부를 추적
        current_user_id: str = user_session_id  # 현재 사용자 ID 추적

        try:
            # 1) LLM 스트림 열기 (AsyncStreamManager)
            stream = await generate_story(prompt, previous_response_id, True)

            # 2) 클라이언트에 시작 알림
            yield 'data: {"event":"start"}\n\n'

            # 3) 토큰 실시간 전송
            async for event in stream:
                # 첫 패킷에서 id 확보
                typ = getattr(event, "type", None)

                if typ == "response.created":
                    response_id = event.response.id
                    # 첫 응답인 경우(user_session_id가 없는 경우) 현재 response_id가 세션 ID가 됨
                    if not current_user_id:
                        current_user_id = response_id

                elif typ == "response.output_text.delta":      # ✨ 변경
                    token = event.delta                        # delta = 한글자/몇글자
                    full_response_text += token
                    
                    # 이 토큰이 choices JSON의 시작인지 확인
                    if is_story_part and '{' in (full_response_text[-15:] + token):
                        is_story_part = False
                        print(f"is_story_part: {is_story_part}")
                    
                    # 스토리 부분인 경우에만 토큰 전송
                    if is_story_part:
                        yield f"data: {json.dumps({'event':'token','data':token})}\n\n"

                elif typ == "response.output_text.done":       # ✨ 변경
                    break       

            # 4) 텍스트 파싱 → 선택지
            choices = [Choice(**c) for c in parse_choices(full_response_text)]

            story_text = extract_story_text(full_response_text)
            print(f"full_text: {full_response_text}")

            # 5) 이미지 생성 (CPU block ⇒ executor)
            try:
                image_prompt = extract_dalle_prompt(full_response_text)
                if image_prompt:
                    loop = asyncio.get_running_loop()
                    
                    # 사용자의 첫 번째 이미지가 있는 경우 항상 그 이미지를 편집
                    first_image_id = get_first_image_id(current_user_id)
                    if first_image_id:
                        first_image_bytes = get_image(current_user_id, first_image_id)
                        if first_image_bytes:
                            # 이미지 편집 호출 (CPU 작업이므로 executor에서 실행)
                            img_result = await loop.run_in_executor(
                                None,
                                partial(
                                    create_image_edit,
                                    prompt=image_prompt,
                                    image_bytes=first_image_bytes
                                ),
                            )
                            image_bytes = img_result
                        else:
                            # Redis에서 첫 이미지를 찾지 못한 경우 새 이미지 생성
                            img_result = await loop.run_in_executor(
                                None,
                                partial(
                                    generate_image,
                                    prompt=image_prompt,
                                    model="gpt-image-1",
                                    output_format="png",
                                    moderation="low",
                                    quality="high",
                                    size="1024x1024",
                                ),
                            )
                            image_bytes = img_result["image_bytes"]
                            
                            # 첫 이미지 ID 저장 (첫 이미지를 재생성하는 경우)
                            store_first_image_id(current_user_id, response_id)
                    else:
                        # 첫 이미지가 없는 경우 새 이미지 생성
                        img_result = await loop.run_in_executor(
                            None,
                            partial(
                                generate_image,
                                prompt=image_prompt,
                                model="gpt-image-1",
                                output_format="png",
                                moderation="low",
                                quality="high",
                                size="1024x1024",
                            ),
                        )
                        image_bytes = img_result["image_bytes"]
                        
                        # 첫 이미지 ID 저장
                        store_first_image_id(current_user_id, response_id)
                    
                    # 이미지를 Redis에 저장
                    store_image(current_user_id, response_id, image_bytes)
                    
                    # Redis 실패 시 파일에 저장 (선택 사항)
                    if not redis_client:
                        image_path = TEMP_IMAGE_DIR / f"{current_user_id}_{response_id}.png"
                        with open(image_path, "wb") as f:
                            f.write(image_bytes)
            except Exception as img_err:
                logger.error(f"SSE - 이미지 생성 실패: {img_err}")

            # 6) 종료 알림 (story_text 추가) - 세션 ID 포함
            yield f"data: {json.dumps({'event':'end','response_id': response_id,'user_session_id': current_user_id,'story_text': story_text,'choices':[c.dict() for c in choices]})}\n\n"

        except OpenAIError:
            logger.error("SSE - LLM 서비스 호출 실패")
            yield 'data: {"event":"error","detail":"LLM 서비스 호출 실패"}\n\n'
        except Exception as e:
            logger.exception("SSE - 예기치 않은 오류")
            yield f'data: {{"event":"error","detail":"{str(e)}"}}\n\n'

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)


# ---------------------------------------------------------------------------
#  GET /api/v1/story/image/{response_id}  – 이미지 다운로드
# ---------------------------------------------------------------------------

@router.get("/image/{response_id}")
async def get_story_image(response_id: str, user_session_id: str):
    """
    스토리 응답 ID에 해당하는 이미지를 다운로드합니다.
    SSE 스트림 완료 후 별도 요청으로 이미지를 받아오는 엔드포인트입니다.
    """
    try:
        # Redis에서 이미지 조회
        image_bytes = get_image(user_session_id, response_id)
        
        if not image_bytes:
            # Redis에 없으면 파일에서 조회 (옵션)
            image_path = TEMP_IMAGE_DIR / f"{user_session_id}_{response_id}.png"
            if image_path.exists():
                with open(image_path, "rb") as f:
                    image_bytes = f.read()
                
                # Redis에 다시 저장
                if redis_client:
                    store_image(user_session_id, response_id, image_bytes)
            else:
                raise FileNotFoundError(f"이미지를 찾을 수 없습니다: 사용자 {user_session_id}, 응답 {response_id}")
        
        return Response(
            content=image_bytes,
            media_type="image/png",
            headers={
                "Content-Disposition": f"attachment; filename=story_image_{response_id}.png"
            }
        )
    except Exception as e:
        logger.exception(f"이미지 다운로드 실패: {str(e)}")
        raise HTTPException(status_code=404, detail="이미지를 찾을 수 없습니다.")


# ---------------------------------------------------------------------------
#  GET /health  – 헬스체크
# ---------------------------------------------------------------------------

@router.get("/health")
async def health_check():
    """단순 헬스 체크."""
    if redis_client:
        try:
            if redis_client.ping():
                return {"status": "healthy", "redis": "connected"}
        except RedisError:
            return {"status": "healthy", "redis": "disconnected"}
    
    return {"status": "healthy", "redis": "disabled"}
