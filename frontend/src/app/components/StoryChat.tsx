"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Choice {
  id: string;
  description: string;
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
  choices?: Choice[];
  responseId?: string;
  imageUrl?: string;
}

// 추가: 디버깅 변수를 true로 설정하면 토큰 전송 관련 로그를 더 자세히 출력합니다
const DEBUG_STREAMING = true;

export default function StoryChat() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      content: "동화 이야기를 시작하려면 주제를 입력해주세요. 예: '바닷속 모험', '우주 탐험' 등",
    },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isInitialPrompt, setIsInitialPrompt] = useState(true); // 첫 입력 상태 추적
  const [useStreaming, setUseStreaming] = useState(true); // 스트리밍 상태 추가 (기본값 true)
  const [streamContent, setStreamContent] = useState(""); // 스트리밍 콘텐츠 변경을 추적하기 위한 상태 추가
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastResponseId = useRef<string | null>(null);
  const userSessionId = useRef<string | null>(null); // 사용자 세션 ID 저장용 ref 추가
  const eventSourceRef = useRef<EventSource | null>(null); // EventSource 참조 추가
  const assistantMessageIndexRef = useRef<number>(-1); // assistantMessageIndex를 위한 Ref 추가
  
  // 불필요한 쓰로틀링 관련 ref 제거
  const accumulatedContentRef = useRef<string>("");
  // 타이머 ref 제거
  // 마지막 업데이트 시간 ref 제거

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      // EventSource 정리
      eventSourceRef.current?.close();
      // 타이머 정리 제거
    };
  }, []);

  // SSE 스트림 처리 함수 (EventSource 사용)
  const handleStreamRequest = useCallback(async (currentPrompt: string, currentLastResponseId: string | null) => {
    setIsGenerating(true);
    accumulatedContentRef.current = "";
    
    // EventSource 닫기
    eventSourceRef.current?.close();

    // 즉시 업데이트 함수 - 스트리밍 중 스크롤 지원 제거
    const updateDraft = (content: string) => {
      if (DEBUG_STREAMING) console.log(`Instant update: ${content.slice(-20)}... (len: ${content.length})`);
      
      // 스트리밍 콘텐츠 상태 업데이트
      setStreamContent(content);
      
      // 메시지 업데이트
      setMessages(prev => {
        const updatedMessages = [...prev];
        if (assistantMessageIndexRef.current !== -1 && updatedMessages[assistantMessageIndexRef.current]) {
          updatedMessages[assistantMessageIndexRef.current].content = content + "▍"; // 커서 효과 추가
        }
        return updatedMessages;
      });
      
      // 스크롤 코드 삭제
    };

    const finalizeMessage = (finalContent: string, endData: any) => {
      if (DEBUG_STREAMING) console.log(`Final update: ${finalContent.slice(-20)}... (len: ${finalContent.length})`);
      
      // 최종 스트리밍 콘텐츠 업데이트
      setStreamContent(finalContent);

      console.log("ENDDATA LOG", endData);
      
      // 선택지 디버깅 로그 추가
      if (endData.choices) {
        console.log("선택지 받음:", endData.choices);
        console.log("선택지 타입:", typeof endData.choices);
        console.log("선택지 길이:", endData.choices.length);
        console.log("선택지 구조:", JSON.stringify(endData.choices));
      } else {
        console.log("선택지 없음");
      }

      // user_session_id 저장 (첫 응답에서만 설정)
      if (endData.user_session_id && !userSessionId.current) {
        console.log("사용자 세션 ID 설정:", endData.user_session_id);
        userSessionId.current = endData.user_session_id;
      }

      // 현재 인덱스 저장 (초기화 전에)
      const currentAssistantIndex = assistantMessageIndexRef.current;
      
      // 인덱스 상태 디버깅
      console.log("인덱스 확인:", {
        'currentAssistantIndex': currentAssistantIndex,
        'messages.length': messages.length,
        '배열에 존재?': currentAssistantIndex !== -1 && currentAssistantIndex < messages.length
      });

      // 이미지 다운로드 URL 생성 (user_session_id 포함)
      let imageUrl = undefined;
      if (endData.response_id) {
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        // user_session_id 파라미터 추가
        const sessionId = endData.user_session_id || userSessionId.current;
        imageUrl = `${apiBaseUrl}/api/v1/story/image/${endData.response_id}?user_session_id=${sessionId}`;
        console.log("이미지 URL 생성:", imageUrl);
      }

      // flushSync 제거하고 일반 상태 업데이트 사용
      setMessages(prev => {
        const updatedMessages = [...prev];
        if (currentAssistantIndex !== -1 && updatedMessages[currentAssistantIndex]) {
          const choices = Array.isArray(endData.choices) ? endData.choices : [];
          
          // 업데이트 전 디버깅
          console.log("업데이트 전 메시지:", updatedMessages[currentAssistantIndex]);
          console.log("선택지 데이터:", choices);
          
          // 새 객체로 참조 변경 보장
          updatedMessages[currentAssistantIndex] = {
            role: "assistant", 
            content: finalContent, // 최종 텍스트 (커서 없음)
            responseId: endData.response_id ?? undefined,
            choices: [...choices], // 새 배열로 복사하여 참조 문제 방지
            imageUrl: imageUrl // 새로 생성한 이미지 URL로 설정
          };
          
          console.log("업데이트된 메시지:", updatedMessages[currentAssistantIndex]);
        } else {
          console.log("메시지 업데이트 실패: 인덱스가 유효하지 않거나 메시지가 존재하지 않음");
        }
        return updatedMessages;
      });
      
      // 최종 메시지 확정 후 스크롤 적용 코드 삭제
      
      lastResponseId.current = endData.response_id;
      if (isInitialPrompt) {
        setIsInitialPrompt(false);
      }
      setIsGenerating(false);
      
      // setTimeout 제거 - useEffect에서 처리하도록 변경
      // assistantMessageIndexRef는 useEffect에서 초기화
    };

    const handleStreamingError = (errorMessage: string) => {
      console.error("Streaming Error:", errorMessage);
      
      // flushSync 제거하고 일반 상태 업데이트 사용
      setMessages(prev => {
        const filteredMessages = prev.filter((_, index) => index !== assistantMessageIndexRef.current);
        return [
          ...filteredMessages,
          { role: "system", content: `이야기 생성 중 오류 발생: ${errorMessage}` },
        ];
      });
      
      setIsGenerating(false);
      eventSourceRef.current?.close();
      assistantMessageIndexRef.current = -1;
    };

    // -------- EventSource 로직 시작 --------
    try {
      const apiUrl = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/story/stream_sse`);
      apiUrl.searchParams.append('prompt', currentPrompt);
      if (currentLastResponseId) {
        apiUrl.searchParams.append('previous_response_id', currentLastResponseId);
      }
      // 사용자 세션 ID가 있으면 요청에 포함
      if (userSessionId.current) {
        apiUrl.searchParams.append('user_session_id', userSessionId.current);
        console.log("요청에 사용자 세션 ID 포함:", userSessionId.current);
      }

      // 빈 어시스턴트 메시지 추가
      // flushSync 제거하고 일반 상태 업데이트 사용
      setMessages(prev => {
        const newMessages: Message[] = [...prev, { role: "assistant", content: "..." }];
        assistantMessageIndexRef.current = newMessages.length - 1;
        return newMessages;
      });

      if (DEBUG_STREAMING) console.log("Creating EventSource for:", apiUrl.toString());
      
      const es = new EventSource(apiUrl.toString());
      eventSourceRef.current = es;

      es.onmessage = (ev) => {
        try {
          if (DEBUG_STREAMING) console.log("Raw SSE data:", ev.data);
          
          const jsonData = ev.data;
          if (!jsonData) return;
          
          const data = JSON.parse(jsonData);
          if (DEBUG_STREAMING) console.log("Parsed event:", data);

          if (data.event === 'start') {
            console.log('Streaming started...');
          } else if (data.event === "token") {
            // 새 토큰 추가 및 즉시 업데이트 (쓰로틀링 없음)
            accumulatedContentRef.current += data.data;
            updateDraft(accumulatedContentRef.current);
          } else if (data.event === "end") {
            console.log('Streaming finished.');
            finalizeMessage(accumulatedContentRef.current, data);
            es.close();
            eventSourceRef.current = null;
          } else if (data.event === "error") {
            console.error('Backend Error:', data.detail);
            handleStreamingError(data.detail || "스트리밍 중 서버 오류 발생");
          }
        } catch (jsonError) {
          console.error("SSE 데이터 파싱 오류:", jsonError, "데이터:", ev.data);
          handleStreamingError("잘못된 데이터 수신");
        }
      };

      es.onerror = (err) => {
        console.error("EventSource failed:", err);
        handleStreamingError("서버 연결 오류 발생");
        es.close();
        eventSourceRef.current = null;
      };

    } catch (error) {
      handleStreamingError(error instanceof Error ? error.message : String(error));
    }
    // -------- EventSource 로직 끝 --------
  }, [isInitialPrompt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    const currentPrompt = prompt;
    const newUserMessage: Message = { role: "user", content: currentPrompt };
    setMessages((prev) => [...prev, newUserMessage]);
    setPrompt(""); // 입력 필드 초기화

    if (useStreaming) {
      await handleStreamRequest(currentPrompt, lastResponseId.current);
    } else {
      // 기존 비-스트리밍 로직
      setIsGenerating(true);
      try {
        const requestBody: any = {
          prompt: currentPrompt,
          previous_response_id: lastResponseId.current,
        };
        
        // 사용자 세션 ID가 있으면 요청에 포함
        if (userSessionId.current) {
          requestBody.user_session_id = userSessionId.current;
        }
        
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/story`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error("이야기 생성 실패");
        }

        const data = await response.json();
        lastResponseId.current = data.response_id;
        
        // 사용자 세션 ID 저장 (첫 응답에서만)
        if (data.user_session_id && !userSessionId.current) {
          userSessionId.current = data.user_session_id;
        }
        
        // 이미지 URL에 user_session_id 추가
        let imageUrl = data.image_url;
        if (data.image_url && userSessionId.current) {
          // 이미지 URL에 user_session_id 파라미터 추가
          const sessionParam = `user_session_id=${userSessionId.current}`;
          imageUrl = data.image_url.includes('?') 
            ? `${data.image_url}&${sessionParam}`
            : `${data.image_url}?${sessionParam}`;
        }
        
        const newAssistantMessage: Message = {
          role: "assistant",
          content: data.text,
          choices: data.choices,
          responseId: data.response_id,
          imageUrl: imageUrl,
        };
        setMessages((prev) => [...prev, newAssistantMessage]);
        if (isInitialPrompt) {
          setIsInitialPrompt(false);
        }
      } catch (error) {
        console.error("Error:", error);
        setMessages((prev) => [
          ...prev,
          { role: "system", content: "이야기를 생성하는 중 오류가 발생했습니다. 다시 시도해주세요." },
        ]);
      } finally {
        setIsGenerating(false);
      }
    }
  };

  const handleChoiceClick = async (choice: Choice) => {
    if (isGenerating) return;

    const choiceDescription = choice.description; // 설명 저장
    const choiceMessage: Message = { role: "user", content: `선택: ${choiceDescription}` };
    setMessages((prev) => [...prev, choiceMessage]);

    if (useStreaming) {
      await handleStreamRequest(choiceDescription, lastResponseId.current);
    } else {
       // 기존 비-스트리밍 로직
      setIsGenerating(true);
      try {
        const requestBody: any = {
          prompt: choiceDescription,
          previous_response_id: lastResponseId.current,
        };
        
        // 사용자 세션 ID가 있으면 요청에 포함
        if (userSessionId.current) {
          requestBody.user_session_id = userSessionId.current;
        }
        
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/story`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error("이야기 생성 실패");
        }

        const data = await response.json();
        lastResponseId.current = data.response_id;
        
        // 이미지 URL에 user_session_id 추가
        let imageUrl = data.image_url;
        if (data.image_url && userSessionId.current) {
          const sessionParam = `user_session_id=${userSessionId.current}`;
          imageUrl = data.image_url.includes('?') 
            ? `${data.image_url}&${sessionParam}`
            : `${data.image_url}?${sessionParam}`;
        }
        
        const newAssistantMessage: Message = {
          role: "assistant",
          content: data.text,
          choices: data.choices,
          responseId: data.response_id,
          imageUrl: imageUrl,
        };
        setMessages((prev) => [...prev, newAssistantMessage]);
      } catch (error) {
        console.error("Error:", error);
        setMessages((prev) => [
          ...prev,
          { role: "system", content: "이야기를 진행하는 중 오류가 발생했습니다. 다시 시도해주세요." },
        ]);
      } finally {
        setIsGenerating(false);
      }
    }
  };

  const resetChat = () => {
    // 타이머 정리 코드 제거
    
    setMessages([
      {
        role: "system",
        content: "동화 이야기를 시작하려면 주제를 입력해주세요. 예: '바닷속 모험', '우주 탐험' 등",
      },
    ]);
    setStreamContent(""); // 스트리밍 콘텐츠 초기화 추가
    lastResponseId.current = null;
    userSessionId.current = null; // 사용자 세션 ID 초기화 추가
    setIsInitialPrompt(true);
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    assistantMessageIndexRef.current = -1;
  };

  // 선택지가 표시되어야 하는지 여부 확인 (수정)
  const hasActiveChoices = messages.some(m => {
    const hasChoices = m.role === "assistant" && m.choices && m.choices.length > 0;
    // 디버깅 로그 추가
    if (m.role === "assistant") {
      console.log("어시스턴트 메시지 선택지 확인:", m.choices, "메시지 ID:", m.responseId);
    }
    return hasChoices;
  });

  // 마지막 메시지가 어시스턴트 메시지인지 확인
  const lastMessageIsAssistant = messages.length > 1 && 
    messages[messages.length - 1].role === "assistant";
    
  // 디버깅: 현재 상태 로깅
  console.log("상태 디버깅:", { 
    isInitialPrompt, 
    hasActiveChoices, 
    lastMessageIsAssistant, 
    isGenerating,
    totalMessages: messages.length,
    lastMessage: messages.length > 0 ? messages[messages.length - 1] : null,
    userSessionId: userSessionId.current
  });
  
  // 모든 메시지 상세 확인용 디버깅 로그
  console.log("현재 모든 메시지:", messages.map(m => ({
    role: m.role,
    contentLength: m.content?.length || 0,
    hasChoices: !!m.choices,
    choicesLength: m.choices?.length || 0,
    responseId: m.responseId
  })));

  // assistantMessageIndexRef 초기화를 위한 useEffect 추가
  useEffect(() => {
    // isGenerating이 false로 변경되었을 때만 실행
    if (!isGenerating && assistantMessageIndexRef.current !== -1) {
      console.log("useEffect: isGenerating이 false로 변경됨, 어시스턴트 메시지 인덱스 초기화");
      assistantMessageIndexRef.current = -1;
    }
  }, [isGenerating]); // isGenerating 상태가 변경될 때마다 실행

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col h-full">
      {/* 채팅 헤더 */}
      <div className="flex justify-between items-center mb-4 px-2">
        <h2 className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">동화 채팅</h2>
        <div className="flex items-center gap-4"> {/* 버튼과 토글 그룹화 */}
            {/* 스트리밍 토글 버튼 */}
            <label htmlFor="streaming-toggle" className="flex items-center cursor-pointer">
                <span className="mr-2 text-sm text-gray-600">실시간 응답</span>
                <div className="relative">
                    <input id="streaming-toggle" type="checkbox" checked={useStreaming} onChange={() => setUseStreaming(!useStreaming)} className="sr-only" />
                    <div className={`block w-10 h-6 rounded-full transition-colors duration-300 ease-in-out ${useStreaming ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
                    <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ease-in-out ${useStreaming ? 'transform translate-x-4' : ''}`}></div>
                </div>
            </label>
            {/* 리셋 버튼 */}
            <button
              onClick={resetChat}
              className="text-sm px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-md transition-all duration-300 hover:shadow-md"
            >
              새 이야기 시작하기
            </button>
        </div>
      </div>
      
      {/* 메시지 컨테이너 */}
      <div className="flex-1 overflow-y-auto mb-4 p-4 rounded-lg bg-white/80 shadow-inner border border-gray-100">
        {messages.map((message, i) => (
          <div
            key={i}
            className={`mb-4 message-animation ${
              message.role === "user"
                ? "text-right"
                : message.role === "system"
                ? "text-center italic text-gray-500"
                : "text-left"
            }`}
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <div
              className={`inline-block px-4 py-2 rounded-lg shadow-sm whitespace-pre-wrap ${ // 줄바꿈 처리
                message.role === "user"
                  ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-br-none"
                  : message.role === "system"
                  ? "bg-gray-100"
                  : "bg-gray-200 text-gray-800 rounded-bl-none"
              }`}
            >
              {message.content}
            </div>
            
            {/* 이미지 표시 */}
            {message.role === "assistant" && message.imageUrl && (
              <div className="mt-3 mb-3 flex justify-start"> {/* 이미지 왼쪽 정렬 */}
                <img
                  src={message.imageUrl}
                  alt="스토리 이미지"
                  className="max-w-xs md:max-w-sm rounded-lg shadow-md" // mx-auto 제거
                  loading="lazy"
                />
              </div>
            )}
            
            {/* 선택지 버튼 */}
            {message.role === "assistant" && message.choices && message.choices.length > 0 && !isGenerating && ( // 생성 중 아닐 때만 선택지 표시
              <div className="mt-3 flex flex-col items-start gap-2 pl-2">
                {message.choices.map((choice) => (
                  <button
                    key={choice.id}
                    onClick={() => handleChoiceClick(choice)}
                    disabled={isGenerating} // 중복 클릭 방지
                    className="py-2 px-4 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-full text-sm transition-all duration-300 hover:shadow-md disabled:opacity-50 hover:translate-x-1 btn-pulse"
                  >
                    {choice.description}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* 로딩 중 표시 - isGenerating일 때만 메시지 목록 끝에 표시 */}
        {isGenerating && !isInitialPrompt && (
          <div 
            className="mb-4 message-animation text-left" 
            style={{ animationDelay: `${messages.length * 0.1}s` }}
          >
            <div className="inline-block px-4 py-2 rounded-lg shadow-sm bg-gray-200 text-gray-800 rounded-bl-none">
              <div className="flex items-center">
                {/* 새로운 간단한 로딩 아이콘 (3-dot bounce) */}
                <div className="flex space-x-1 mr-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                </div>
                <span className="font-medium text-sm">이미지 생성 중...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 입력 폼 - 초기 입력 또는 선택지 없을 때 표시 */}
      {isInitialPrompt && ( // 초기 프롬프트일 때만 입력 폼 표시
         <form onSubmit={handleSubmit} className="flex gap-2 relative">
           <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isGenerating} // 생성 중일 때만 비활성화
            placeholder={"이야기 주제를 입력하세요..."} // 플레이스홀더 고정
            className="flex-1 p-3 rounded-lg border-2 border-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent disabled:bg-gray-100 transition-all duration-300 shadow-sm"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || isGenerating} // 비활성화 조건 단순화
            className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white px-6 py-2 rounded-lg transition-all duration-300 hover:shadow-md disabled:opacity-50 font-medium"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                생성 중...
              </span>
            ) : (
               "시작하기" // 버튼 텍스트 고정
            )}
          </button>
         </form>
      )}
      
      {/* 이야기 종료 안내 메시지 - 선택지가 없고, 마지막 메시지가 어시스턴트이며, 생성 중이 아닐 때 */}
      {!isInitialPrompt && !hasActiveChoices && lastMessageIsAssistant && !isGenerating && (
        <div className="w-full p-4 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-100 rounded-lg text-center text-yellow-800 shadow-inner transition-all duration-500 message-animation">
          <p>이야기가 끝났습니다. 새 이야기를 시작하려면</p>
          <button
            onClick={resetChat}
            className="mt-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-400 text-white rounded-md hover:shadow-md transition-all duration-300 font-medium"
          >
            새로운 이야기 시작하기
          </button>
        </div>
      )}
    </div>
  );
} 