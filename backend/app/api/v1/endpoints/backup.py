# from fastapi import APIRouter, HTTPException, Depends
# from fastapi.responses import StreamingResponse
# from app.schemas.story import StoryRequest, StoryResponse, Choice
# from app.services.llm_service import generate_story, parse_choices
# from app.services.dalle_gen_img import extract_dalle_prompt, generate_image
# import asyncio
# from functools import partial
# import logging
# import json
# from openai import OpenAIError
# from typing import Optional


# logger = logging.getLogger(__name__)

# router = APIRouter(
#     tags=["story"],
# )

# @router.post("/", response_model=StoryResponse)
# async def create_story(request: StoryRequest):

#     """
#     스토리를 생성하는 엔드포인트
#     """
#     try:
#         # 동기 호출을 비동기로 래핑
#         loop = asyncio.get_event_loop()
#         raw = await loop.run_in_executor(
#             None,
#             partial(generate_story, request.prompt, request.previous_response_id, False)
#         )

#         # choices 파싱
#         choices_data = parse_choices(raw.output_text)
#         choices = [Choice(**c) for c in choices_data]

#         # 응답 객체 생성
#         response = StoryResponse(
#             text=raw.output_text,
#             choices=choices,
#             response_id=raw.id,
#         )
        
#         # DALL-E 프롬프트 추출 및 이미지 생성
#         try:
#             dalle_prompt = extract_dalle_prompt(raw.output_text)
#             if dalle_prompt:
#                 # 이미지 생성
#                 image_result = generate_image(
#                     prompt=dalle_prompt,
#                     model="gpt-image-1",
#                     style="vivid",
#                     quality="standard",
#                     size="512x512"
#                 )
#                 # 이미지 URL 응답에 추가
#                 response.image_url = image_result["image_url"]
#                 logger.info(f"이미지 생성 성공: {response.image_url}")
#         except Exception as img_error:
#             # 이미지 생성 실패해도 스토리 응답은 반환
#             logger.error(f"이미지 생성 실패: {str(img_error)}")
            
#         return response

#     except OpenAIError as oe:
#         logger.error("LLM 서비스 호출 실패", exc_info=oe)
#         raise HTTPException(status_code=502, detail="LLM 서비스 호출 실패")
#     except Exception as e:
#         logger.exception(f"스토리 생성 중 예기치 않은 오류: {str(e)}")
#         raise HTTPException(status_code=500, detail=f"서버 내부 오류: {str(e)}")

# @router.get("/stream_sse")
# async def create_story_sse(
#     prompt: str,
#     previous_response_id: Optional[str] = None,
# ):
#     async def event_generator():
#         full_response_text = ""
#         response_id = None
#         image_url = None

#         try:
#             loop = asyncio.get_event_loop()
#             # isStream=True 로 스트림 호출
#             stream = await loop.run_in_executor(
#                 None,
#                 partial(generate_story, prompt, previous_response_id, True)
#             )

#             # 시작 이벤트
#             yield f"data: {json.dumps({'event':'start'})}\n\n"

#             for event in stream:
#                 typ = getattr(event, "type", None)

#                 if typ == "response.created":
#                     response_id = event.response.id

#                 elif typ == "response.output_text.delta":      # ✨ 변경
#                     token = event.delta                        # delta = 한글자/몇글자
#                     full_response_text += token
#                     print(token)
#                     yield f"data: {json.dumps({'event':'token','data':token})}\n\n"

#                 elif typ == "response.output_text.done":       # ✨ 변경
#                     break                                      # 텍스트 스트림 끝

#                 # 그 외 이벤트는 무시

#             # === 전체 텍스트 로깅 ===
#             logger.warning(f"SSE - 전체 응답 텍스트:\n{full_response_text}")

#             # === 파싱 & 이미지 생성 ===
#             choices_data = parse_choices(full_response_text)
#             choices = [Choice(**c) for c in choices_data]

#             try:
#                 dalle_prompt = extract_dalle_prompt(full_response_text)
#                 if dalle_prompt:
#                     image_result = await loop.run_in_executor(
#                         None,
#                         partial(
#                             generate_image,
#                             prompt=dalle_prompt,
#                             model="dall-e-3",
#                             style="vivid",
#                             quality="standard",
#                             size="1024x1024",
#                         ),
#                     )
#                     image_url = image_result["image_url"]
#                     logger.info(f"SSE - 이미지 생성 성공: {image_url}")
#             except Exception as img_err:
#                 logger.error(f"SSE - 이미지 생성 실패: {img_err}")

#             # === 종료 이벤트 ===
#             yield f"data: {json.dumps({
#                 'event':'end',
#                 'response_id': response_id,
#                 'choices': [c.dict() for c in choices],
#                 'image_url': image_url
#             })}\n\n"

#         except OpenAIError as oe:
#             logger.error("SSE - LLM 서비스 호출 실패", exc_info=oe)
#             yield f"data: {json.dumps({'event':'error','detail':'LLM 서비스 호출 실패'})}\n\n"
#         except Exception as e:
#             logger.exception("SSE - 예기치 않은 오류")
#             yield f"data: {json.dumps({'event':'error','detail':str(e)})}\n\n"

#     # StreamingResponse에 버퍼링 방지 헤더 추가
#     headers = {
#         'Cache-Control': 'no-cache',
#         'X-Accel-Buffering': 'no'
#     }
#     return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)

# @router.get("/health")
# async def health_check():
#     """
#     API 상태 확인 엔드포인트
#     """
#     return {"status": "healthy"}
