import React, { useState, useEffect, useMemo } from "react";
import { Plus, Send, Info, Search, Lightbulb, CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

const AITutorExplanation = React.memo(() => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col justify-center py-4 md:py-0">
      <div className="mb-4">
        <h3 className="text-xl font-semibold text-stone-800 mb-2">
          {t("interactiveAITutorDemo.explanationTitle")}
        </h3>
        <p className="text-sm text-stone-600 leading-relaxed mb-4">
          {t("interactiveAITutorDemo.explanationP1")}
        </p>
      </div>
      <ul className="space-y-2.5">
        {[
          t("interactiveAITutorDemo.feature1"),
          t("interactiveAITutorDemo.feature2"),
          t("interactiveAITutorDemo.feature3"),
        ].map((feature, index) => (
          <li key={index} className="flex items-start text-sm text-stone-700">
            <CheckCircle className="w-4 h-4 text-green-500 mr-2.5 mt-0.5 flex-shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});
AITutorExplanation.displayName = "AITutorExplanation";

const ChatInterface = () => {
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiMessageKey, setAiMessageKey] = useState(Date.now());

  const demoScript = useMemo(
    () => [
      { type: "user", text: t("interactiveAITutorDemo.userQuestion1") },
      {
        type: "ai",
        text: t("interactiveAITutorDemo.aiAnswer1"),
        citesSource: true,
        documentTitle: t("interactiveAITutorDemo.documentTitle"),
        agentType: "question_answering",
      },
    ],
    [t]
  );

  useEffect(() => {
    let thinkingIndicatorTimeout;
    let loopDemoTimeout;

    const handleNextStep = () => {
      const currentMessagesCount = messages.length;

      if (currentMessagesCount === 0 && demoScript.length > 0) {
        const userMessage = demoScript[0];
        if (userMessage.type === "user") {
          setMessages([{ ...userMessage, id: Date.now() }]);
        }
      } else if (currentMessagesCount === 1 && demoScript.length > 1) {
        const aiMessage = demoScript[1];
        if (aiMessage.type === "ai") {
          setIsAiThinking(true);
          thinkingIndicatorTimeout = setTimeout(() => {
            setIsAiThinking(false);
            setMessages((prev) => [...prev, { ...aiMessage, id: Date.now() }]);
            setAiMessageKey(Date.now());
          }, 1200);
        }
      } else if (
        currentMessagesCount >= demoScript.length &&
        demoScript.length > 0
      ) {
        loopDemoTimeout = setTimeout(() => {
          setMessages([]);
          setIsAiThinking(false);
          setAiMessageKey(Date.now());
        }, 7000);
      }
    };

    handleNextStep();

    return () => {
      clearTimeout(thinkingIndicatorTimeout);
      clearTimeout(loopDemoTimeout);
    };
  }, [messages, demoScript, t]);

  const getAgentIcon = (agentType) => {
    if (agentType === "question_answering")
      return <Search className="w-2.5 h-2.5 text-stone-500" />;
    if (agentType === "explanation")
      return <Lightbulb className="w-2.5 h-2.5 text-stone-500" />;
    return null;
  };

  return (
    <div className="bg-stone-50 p-4 sm:p-6 rounded-xl shadow-xl border border-stone-200/80 flex flex-col h-[400px]">
      <div
        className="mt-1 flex-grow space-y-3 overflow-y-auto pr-2 max-h-[400px]"
        style={{ scrollbarWidth: "thin" }}
      >
        {messages.map((msg, index) => (
          <div
            key={msg.id}
            className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              key={msg.type === "ai" ? aiMessageKey + msg.id : undefined}
              className={`max-w-[85%] py-2 px-3.5 rounded-2xl text-sm relative ${
                msg.type === "user"
                  ? "bg-gradient-to-r from-gray-800 to-gray-700 text-white shadow-md"
                  : "bg-white border border-stone-200 text-stone-900 shadow-md"
              } ${msg.type === "ai" && index === messages.length - 1 ? "animate-fadeInUp" : ""}`}
            >
              {msg.type === "ai" && msg.agentType && (
                <div className="px-0.5 pt-0.5 pb-1">
                  <div className="px-1.5 py-0.5 rounded-full text-[9px] font-medium flex items-center gap-1 self-start bg-stone-100 text-stone-600 border border-stone-200 w-fit">
                    {getAgentIcon(msg.agentType)}
                    <span>
                      {msg.agentType === "question_answering"
                        ? t("chat.agentType.questionAnswering")
                        : msg.agentType === "explanation"
                          ? t("chat.agentType.explanation")
                          : msg.agentType}
                    </span>
                  </div>
                </div>
              )}

              <div
                className={`${msg.type === "ai" && msg.agentType ? "pt-0" : "pt-1"} pb-1`}
              >
                {msg.text}
              </div>

              {msg.type === "ai" && msg.citesSource && msg.documentTitle && (
                <div className="mt-1.5 pt-1.5 border-t border-stone-200/70">
                  <div className="text-xs text-green-700 font-medium flex items-center gap-1 mb-0.5">
                    {t("chat.verifiedFromMaterials")}
                    <div className="relative cursor-help group">
                      <Info className="h-3 w-3 text-stone-400 group-hover:text-stone-500" />
                      <div className="pointer-events-none absolute -top-1 left-1/2 w-max max-w-[200px] -translate-x-1/2 -translate-y-full rounded bg-stone-700 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {t("chat.verifiedTooltip")}
                        <div className="absolute left-1/2 top-[100%] -translate-x-1/2 border-4 border-transparent border-t-stone-700"></div>
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] bg-stone-100 px-1.5 py-0.5 rounded-md text-stone-600 border border-stone-200">
                    {msg.documentTitle}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
        {isAiThinking && (
          <div className="flex justify-start animate-fadeInUp">
            <div className="max-w-[80%] py-2 px-3.5 rounded-2xl text-sm bg-gradient-to-r from-white to-stone-50 border border-stone-200 text-stone-700 animate-pulse shadow-md">
              {t("interactiveAITutorDemo.aiThinking")}
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-2 border border-stone-200/60">
        <div className="flex items-center space-x-2 w-full">
          <button
            className="p-1.5 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-md transition-colors disabled:opacity-50 flex-shrink-0"
            aria-label={t("interactiveAITutorDemo.addImagePlaceholder")}
            title={t("interactiveAITutorDemo.addImagePlaceholder")}
            disabled
          >
            <Plus className="w-4 h-4" />
          </button>
          <input
            type="text"
            placeholder={t("interactiveAITutorDemo.inputPlaceholder")}
            className="flex-1 py-1.5 pr-2 border-0 bg-transparent outline-none text-sm placeholder-stone-400"
            disabled
          />
          <button
            className="bg-gradient-to-r from-gray-800 text-sm to-gray-700 text-white p-1.5 rounded-md shadow-sm hover:from-gray-700 hover:to-gray-600 transition-all duration-150 disabled:opacity-50 flex-shrink-0"
            aria-label={t("interactiveAITutorDemo.sendMessagePlaceholder")}
            disabled
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
ChatInterface.displayName = "ChatInterface";

export default function InteractiveAITutorDemo() {
  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <div className="text-center mb-8 md:mb-10"></div>
      <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
        <AITutorExplanation />
        <ChatInterface />
      </div>
    </div>
  );
}
