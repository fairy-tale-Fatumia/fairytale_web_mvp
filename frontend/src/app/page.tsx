import StoryChat from "./components/StoryChat";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-6 bg-gradient-to-b from-blue-50 to-white">
      <header className="w-full max-w-3xl mx-auto text-center mb-6">
        <h1 className="text-4xl font-bold text-blue-600 mb-2">AI 동화 이야기</h1>
        <p className="text-gray-600 mt-2 max-w-lg mx-auto">
          여러분의 상상력을 AI와 함께 펼쳐보세요! 주제를 입력하고 선택지를 통해 이야기를 만들어갑니다.
        </p>
      </header>
      
      <div className="w-full max-w-3xl flex-1 flex flex-col h-[calc(100vh-180px)] bg-white p-4 rounded-xl shadow-lg">
        <StoryChat />
      </div>
      
      <footer className="w-full max-w-3xl mx-auto text-center mt-6 text-xs text-gray-500">
        © 2024 AI 동화 이야기 - 모든 권리 보유
      </footer>
    </main>
  );
}
