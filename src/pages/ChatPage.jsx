import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { functions } from "../utils/firebase";
import {
  Smile,
  Send,
  Loader2,
  AlertCircle,
  Trash2,
  ArrowDown,
  Info,
  Copy,
  Check,
  Search,
  X,
  Lightbulb,
  Plus,
} from "lucide-react";
import { httpsCallable } from "firebase/functions";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "./chat-markdown.css";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

// Custom components for ReactMarkdown
const MarkdownComponents = {
  // Regular paragraph - this needs special handling to avoid nesting issues
  p: ({ node, children, ...props }) => {
    // Check if this paragraph has only one child and it's a code block
    const hasCodeBlock =
      Array.isArray(node?.children) &&
      node.children.some(
        (child) => child.tagName === "code" && !child.properties?.inline
      );

    if (hasCodeBlock) {
      return <>{children}</>; // Just render children without paragraph wrapper
    }

    return <p {...props}>{children}</p>;
  },

  // Headings
  h1: ({ children }) => <h1>{children}</h1>,
  h2: ({ children }) => <h2>{children}</h2>,
  h3: ({ children }) => <h3>{children}</h3>,
  h4: ({ children }) => <h4>{children}</h4>,
  h5: ({ children }) => <h5>{children}</h5>,
  h6: ({ children }) => <h6>{children}</h6>,

  // Lists
  ul: ({ children, className }) => {
    // Filter out all unexpected props
    const allowedProps = {};
    // Explicitly add only the props you want to pass
    if (className) allowedProps.className = className;

    return <ul {...allowedProps}>{children}</ul>;
  },
  ol: ({ children, className }) => {
    const allowedProps = {};
    if (className) allowedProps.className = className;

    return <ol {...allowedProps}>{children}</ol>;
  },
  li: ({ children, className }) => {
    const allowedProps = {};
    if (className) allowedProps.className = className;

    return <li {...allowedProps}>{children}</li>;
  },

  // Links
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),

  // Blockquote
  blockquote: ({ children }) => <blockquote>{children}</blockquote>,

  // Code - handle both inline and block, including math expressions
  code: ({ inline, className, children, ...props }) => {
    // For LaTeX math expressions
    if (className === "math math-display" || className === "math math-inline") {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }

    // For inline code (like `code`)
    if (
      inline ||
      (children &&
        String(children).length < 40 &&
        !String(children).includes("\n"))
    ) {
      return (
        <code className="inline-code bg-stone-200 text-stone-800 px-1 py-0.5 rounded text-sm">
          {children}
        </code>
      );
    }

    // For code blocks - we create a standalone component structure
    // Extract language from className if provided
    const language = className ? className.replace("language-", "") : "";
    const displayLanguage = language || "Code";

    // Content cleaning - helps with formatting
    const content = children ? String(children).trim() : "";

    return (
      <div className="bg-stone-200 rounded-lg overflow-hidden my-3">
        <div className="bg-stone-300 px-4 py-1 text-xs font-medium text-stone-700">
          {displayLanguage}
        </div>
        <pre className="overflow-auto p-3 text-sm text-stone-800">
          <code>{content}</code>
        </pre>
      </div>
    );
  },

  // Very important - don't wrap code blocks with pre
  pre: ({ children }) => <>{children}</>,

  // Tables
  table: ({ children }) => (
    <div className="overflow-x-auto my-3">
      <table>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th>{children}</th>,
  td: ({ children }) => <td>{children}</td>,

  // Horizontal rule
  hr: () => <hr />,
};

// Add PropTypes for all components
Object.keys(MarkdownComponents).forEach((key) => {
  if (key === "code") {
    MarkdownComponents[key].propTypes = {
      inline: PropTypes.bool,
      className: PropTypes.string,
      children: PropTypes.node,
    };
  } else if (key === "p") {
    MarkdownComponents[key].propTypes = {
      node: PropTypes.object,
      children: PropTypes.node,
      className: PropTypes.string,
    };
  } else if (key === "a") {
    MarkdownComponents[key].propTypes = {
      href: PropTypes.string,
      children: PropTypes.node,
    };
  } else if (key === "hr") {
    MarkdownComponents[key].propTypes = {};
  } else if (["ul", "ol", "li"].includes(key)) {
    MarkdownComponents[key].propTypes = {
      children: PropTypes.node,
      className: PropTypes.string,
    };
  } else {
    MarkdownComponents[key].propTypes = {
      children: PropTypes.node,
    };
  }
});

// Memoized message component for better performance with large chat histories
const Message = memo(
  ({ message, index, messagesLength, copiedMessageId, handleCopyMessage }) => {
    const isAI = message.sender === "ai";
    const isLatestAIMessage = isAI && index === messagesLength - 1;
    const { t } = useTranslation();

    return (
      <div
        className={`flex ${
          message.sender === "user" ? "justify-end" : "justify-start"
        } ${
          isLatestAIMessage ? "animate-fadeIn" : ""
        } max-w-3xl mx-auto w-full`}
      >
        <div
          className={
            message.sender === "user"
              ? "max-w-[85%] sm:max-w-[75%] md:max-w-[70%]"
              : "w-auto max-w-[90%] sm:max-w-[95%] md:max-w-[95%] relative flex flex-col"
          }
        >
          <div className="relative">
            {isAI && (
              <button
                onClick={() => handleCopyMessage(message.content, index)}
                className="absolute -right-8 sm:-right-10 top-1 p-1.5 bg-white rounded-full shadow-sm border border-stone-200 opacity-90 transition-opacity"
                aria-label={t("chat.copyMessage")}
              >
                {copiedMessageId === index ? (
                  <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-stone-700" />
                ) : (
                  <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-stone-500" />
                )}
              </button>
            )}
            <div
              className={`rounded-2xl shadow-lg overflow-hidden ${message.sender === "user" ? "bg-gradient-to-r from-gray-800 to-gray-700 text-white" : "bg-gradient-to-r from-white to-stone-50 border border-stone-200 text-stone-900"}`}
            >
              {/* Agent Type Indicator - now inside the message bubble */}
              {isAI && message.agentType && message.agentType !== "general" && (
                <div className="px-4 pt-3 pb-1">
                  <div
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1 self-start
                    bg-stone-100 text-stone-600 border border-stone-200 
                    relative overflow-hidden animate-fadeIn w-fit"
                  >
                    {message.agentType === "question_answering" ? (
                      <>
                        <Search className="w-2.5 h-2.5 text-stone-500" />
                        <span>{t("chat.agentType.questionAnswering")}</span>
                      </>
                    ) : message.agentType === "explanation" ? (
                      <>
                        <Lightbulb className="w-2.5 h-2.5 text-stone-500" />
                        <span>{t("chat.agentType.explanation")}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              )}
              <div
                className={`${
                  message.sender === "user" ? "text-white" : "text-stone-900"
                } px-4 py-3 break-words markdown-content ${
                  message.sender === "ai" &&
                  message.agentType &&
                  message.agentType !== "general"
                    ? "pt-1" // Less padding at top when agent indicator is present
                    : ""
                }`}
              >
                {/* Display images for user messages */}
                {message.sender === "user" &&
                  message.mediaContent?.length > 0 && (
                    <div className="mb-3">
                      {message.mediaContent.map(
                        (media, idx) =>
                          media.type === "image" && (
                            <div key={idx} className="relative mb-2">
                              <img
                                src={
                                  media.displayUrl ||
                                  `data:${media.mimeType || "image/jpeg"};base64,${media.data}`
                                }
                                alt="User uploaded"
                                className="max-w-full h-auto rounded-lg max-h-[300px] object-contain"
                              />
                            </div>
                          )
                      )}
                    </div>
                  )}

                {message.sender === "user" ? (
                  message.content
                ) : (
                  <div className="chat-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={MarkdownComponents}
                      skipHtml={true}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>

              {/* Document Sources - Only show for AI messages with document sources */}
              {isAI &&
                message.usedDocuments &&
                message.documentSources &&
                message.documentSources.length > 0 && (
                  <div className="px-4 py-2 border-t border-stone-200 bg-stone-50">
                    <div className="flex items-center mb-1">
                      <div className="text-xs text-stone-700 font-medium flex items-center">
                        <span className="text-green-700 mr-1">
                          {t("chat.verifiedFromMaterials")}
                        </span>
                        <div className="relative cursor-help">
                          <Info className="h-3.5 w-3.5 text-stone-500 peer" />
                          <div className="pointer-events-none absolute -top-1 left-1/2 w-max max-w-xs -translate-x-1/2 -translate-y-full rounded bg-stone-800 px-2 py-1.5 text-xs text-white opacity-0 transition-opacity peer-hover:opacity-100">
                            {t("chat.verifiedTooltip")}
                            <div className="absolute left-1/2 top-[100%] -translate-x-1/2 border-4 border-transparent border-t-stone-800"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(() => {
                        // Group sources by document title
                        const sourcesByDocument = {};

                        // Collect all pages for each document
                        message.documentSources.forEach((source) => {
                          if (!sourcesByDocument[source.title]) {
                            sourcesByDocument[source.title] = {
                              pages: new Set(),
                              docId: source.docId,
                            };
                          }
                          if (source.page) {
                            sourcesByDocument[source.title].pages.add(
                              source.page
                            );
                          }
                        });

                        // Convert to array and format for display
                        return Object.entries(sourcesByDocument).map(
                          ([title, { pages, docId }], idx) => {
                            const pagesArray = Array.from(pages).sort(
                              (a, b) => a - b
                            );
                            const pagesText =
                              pagesArray.length > 0
                                ? ` (p.${pagesArray.join(", ")})`
                                : "";

                            return (
                              <a
                                key={idx}
                                href={docId ? `/document/${docId}` : "#"}
                                target={docId ? "_blank" : "_self"}
                                rel="noopener noreferrer"
                                className={`text-xs bg-white px-2 py-1 rounded-full text-stone-700 border border-stone-300 ${
                                  docId
                                    ? "hover:bg-stone-100 cursor-pointer"
                                    : ""
                                }`}
                              >
                                {title}
                                {pagesText}
                              </a>
                            );
                          }
                        );
                      })()}
                    </div>
                  </div>
                )}

              {/* Information source indicator - show for AI messages without document sources */}
              {isAI &&
                (!message.usedDocuments ||
                  !message.documentSources ||
                  message.documentSources.length === 0) &&
                message.content.length > 100 && (
                  <div className="px-4 py-2 border-t border-stone-200 bg-stone-50">
                    <div className="flex items-center">
                      <div className="text-xs text-stone-500 font-medium flex items-center">
                        <span className="mr-1">
                          {t("chat.basedOnGeneralKnowledge")}
                        </span>
                        <div className="relative cursor-help">
                          <Info className="h-3.5 w-3.5 text-stone-400 hover:text-stone-500 peer" />
                          <div className="pointer-events-none absolute -top-1 left-1/2 w-max max-w-xs -translate-x-1/2 -translate-y-full rounded bg-stone-800 px-2 py-1.5 text-xs text-white opacity-0 transition-opacity peer-hover:opacity-100">
                            {t("chat.generalKnowledgeTooltip")}
                            <div className="absolute left-1/2 top-[100%] -translate-x-1/2 border-4 border-transparent border-t-stone-800"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

// Add display name for React DevTools and ESLint
Message.displayName = "Message";

Message.propTypes = {
  message: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  messagesLength: PropTypes.number.isRequired,
  copiedMessageId: PropTypes.number,
  handleCopyMessage: PropTypes.func.isRequired,
};

// Reliable debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Helper function to group messages for timeline rendering
const groupMessages = (messages) => {
  if (!messages || messages.length === 0) {
    return [];
  }

  const grouped = [];
  let currentSystemGroup = null;

  messages.forEach((msg) => {
    if (msg.sender === "system" && msg.relatedTo) {
      // Start a new group or add to existing one
      if (
        currentSystemGroup &&
        currentSystemGroup.relatedTo === msg.relatedTo
      ) {
        currentSystemGroup.messages.push(msg);
      } else {
        // Finalize previous group if it exists
        currentSystemGroup = {
          type: "system-group",
          id: `system-group-${msg.relatedTo}`, // Group ID
          relatedTo: msg.relatedTo,
          messages: [msg],
        };
        grouped.push(currentSystemGroup);
      }
    } else {
      // Regular user/ai message or system message without relatedTo
      currentSystemGroup = null; // End any active system group
      grouped.push({
        type: "message",
        id: msg.id || `msg-${msg.timestamp?.getTime()}`,
        message: msg,
      });
    }
  });

  return grouped;
};

const ChatPage = ({ isSidebarExpanded }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const messagesRef = useRef([]);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [selectedImages, setSelectedImages] = useState([]);
  const fileInputRef = useRef(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const inputContainerRef = useRef(null);
  const { t } = useTranslation();

  // Enhanced keyboard detection for mobile
  useEffect(() => {
    const detectKeyboard = () => {
      if (!window.visualViewport) return;

      // Get the current viewport dimensions
      const currentViewportHeight = window.visualViewport.height;

      // If viewport height decreased significantly (>25%), keyboard is likely visible
      const heightReduction =
        Math.abs(window.innerHeight - currentViewportHeight) /
        window.innerHeight;
      const isKeyboardVisible = heightReduction > 0.25;

      setKeyboardVisible(isKeyboardVisible);
      setViewportHeight(currentViewportHeight);
    };

    // Multiple event listeners for reliability
    window.addEventListener("resize", detectKeyboard);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", detectKeyboard);
      window.visualViewport.addEventListener("scroll", detectKeyboard);
    }

    // Input focus/blur events as additional indicators
    const handleFocusIn = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        // On mobile, this likely means the keyboard is shown
        setTimeout(detectKeyboard, 100); // Small delay to let keyboard appear
      }
    };

    const handleFocusOut = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        // On mobile, this likely means the keyboard is hidden
        setTimeout(detectKeyboard, 100); // Small delay to let keyboard disappear
      }
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    // Initial detection
    detectKeyboard();

    return () => {
      window.removeEventListener("resize", detectKeyboard);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", detectKeyboard);
        window.visualViewport.removeEventListener("scroll", detectKeyboard);
      }
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  // Update messages ref when messages change (for API calls)
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Efficient scroll position detection
  useEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (!chatContainer) return;

    const debouncedHandleScroll = debounce(() => {
      if (chatContainer) {
        const { scrollHeight, scrollTop, clientHeight } = chatContainer;
        const scrollBottom = scrollHeight - scrollTop - clientHeight;
        const shouldBeNearBottom = scrollBottom < 50;

        if (isNearBottom !== shouldBeNearBottom) {
          setIsNearBottom(shouldBeNearBottom);
        }
      }
    }, 100);

    chatContainer.addEventListener("scroll", debouncedHandleScroll, {
      passive: true,
    });

    return () => {
      chatContainer.removeEventListener("scroll", debouncedHandleScroll);
    };
  }, [isNearBottom]);

  // Optimized scrollToBottom function
  const scrollToBottom = useCallback(
    (force = false) => {
      if (!messagesEndRef.current) return;

      // Force immediate scroll or smooth scroll based on conditions
      if (force || isNearBottom) {
        messagesEndRef.current.scrollIntoView({
          behavior: force ? "auto" : "smooth",
          block: "end",
        });
      }
    },
    [isNearBottom]
  );

  // Scroll management for new messages and loading states
  useEffect(() => {
    if (isLoading) {
      // Always scroll immediately when loading
      scrollToBottom(true);
    } else if (messages.length > 0 && isNearBottom) {
      // Slight delay to ensure content is rendered
      requestAnimationFrame(() => {
        scrollToBottom(false);
      });
    }
  }, [messages, isLoading, scrollToBottom, isNearBottom]);

  // Function to handle image uploads
  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Limit to 2 images per message
    if (selectedImages.length >= 2) {
      setError("Maximum 2 images per message allowed");
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Calculate how many more images can be added
    const remainingSlots = 2 - selectedImages.length;
    const filesToProcess = files.slice(0, remainingSlots);

    if (filesToProcess.length < files.length) {
      setError(
        "Only 2 images per message allowed. Some images were not added."
      );
      setTimeout(() => setError(null), 3000);
    }

    // Process each file
    const newSelectedImages = [];

    filesToProcess.forEach((file) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();

        reader.onload = (event) => {
          // Get the base64 data without the prefix
          const base64Data = event.target.result.split(",")[1];

          newSelectedImages.push({
            type: "image",
            data: base64Data,
            mimeType: file.type,
            displayUrl: URL.createObjectURL(file),
            name: file.name,
          });

          setSelectedImages((current) => [...current, ...newSelectedImages]);
        };

        reader.readAsDataURL(file);
      }
    });

    // Reset the file input
    e.target.value = null;
  };

  // Remove an image from the selected images
  const removeImage = (index) => {
    setSelectedImages((current) => {
      const updated = [...current];
      // Revoke object URL to avoid memory leaks
      if (updated[index].displayUrl) {
        URL.revokeObjectURL(updated[index].displayUrl);
      }
      updated.splice(index, 1);
      return updated;
    });
  };

  // Memoize the grouped messages to avoid re-computation on every render
  const groupedMessages = useMemo(() => groupMessages(messages), [messages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() && selectedImages.length === 0) return;

    const currentMessage = inputMessage.trim();
    // Generate a unique ID for the user message to help filter status messages later
    const userMessageId = `user-${Date.now()}`;
    const currentUserMessage = {
      id: userMessageId, // Add an ID
      content: currentMessage,
      sender: "user",
      timestamp: new Date(),
      mediaContent: selectedImages.map((image) => ({
        type: image.type,
        data: image.data,
        mimeType: image.mimeType,
        displayUrl: image.displayUrl,
      })),
    };

    setMessages((prev) => [...prev, currentUserMessage]);
    setInputMessage("");
    setSelectedImages([]);
    setIsLoading(true);
    setError(null);
    // No need to reset loadingStatus state

    const statusMessageIds = [];

    try {
      const chatHistory = messages
        .filter((msg) => msg.sender === "user" || msg.sender === "ai") // Filter out system messages first
        .slice(-15) // Then take the last 15 actual conversation messages
        .map((msg) => {
          // Ensure ID and displayUrl are not sent if they exist (only needed for UI)
          // Prefix unused variables with _
          // eslint-disable-next-line no-unused-vars
          const { id: _id, mediaContent, ...restOfMsg } = msg;
          // eslint-disable-next-line no-unused-vars
          const { displayUrl: _mediaDisplayUrl, ...restOfMedia } =
            mediaContent || {};
          return {
            ...restOfMsg,
            mediaContent: mediaContent ? restOfMedia : null,
          };
        });

      const generateResponseCallable = httpsCallable(
        functions,
        "generateChatResponse"
      );
      const mediaContentForApi = selectedImages.map((image) => ({
        type: image.type,
        data: image.data,
        mimeType: image.mimeType,
      }));

      const { stream, data } = await generateResponseCallable.stream({
        prompt: currentMessage,
        history: chatHistory,
        mediaContent: mediaContentForApi.length > 0 ? mediaContentForApi : null,
      });

      for await (const chunk of stream) {
        console.log("Received chunk:", chunk);
        if (chunk.type === "status_update" && chunk.payload?.message) {
          const statusMessageId = `status-${Date.now()}-${Math.random()}`; // Add random for higher uniqueness chance
          statusMessageIds.push(statusMessageId);

          const newStatusMessage = {
            id: statusMessageId,
            content: chunk.payload.message,
            sender: "system",
            step: chunk.payload.step,
            timestamp: new Date(),
            relatedTo: userMessageId, // Link to the triggering user message
          };

          // **** CHANGE: Append status message instead of replacing ****
          setMessages((prev) => [...prev, newStatusMessage]);

          // Ensure scroll happens after state update
          requestAnimationFrame(() => scrollToBottom(true));
        }
      }

      const finalResponseData = await data;
      console.log("Final response data:", finalResponseData);

      // --- Process final response or error ---
      let finalAiResponse = null;
      let hadErrorOrRateLimit = false;

      if (finalResponseData.data?.isRateLimit) {
        // Handle Rate Limit
        const nextAvailableTime = new Date(
          finalResponseData.data.nextAvailableAt
        );
        const formattedTime = nextAvailableTime.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        setError(
          `${t("chat.rateLimitExceeded")} ${t("chat.tryAgainAfter", { time: formattedTime })}`
        );
        hadErrorOrRateLimit = true;
      } else if (
        finalResponseData.success === false &&
        finalResponseData.error
      ) {
        // Handle General Error
        setError(finalResponseData.error || t("chat.failedToGetResponse"));
        hadErrorOrRateLimit = true;
      } else if (finalResponseData.success && finalResponseData.data) {
        // Handle Success
        finalAiResponse = {
          id: `ai-${Date.now()}`,
          content: finalResponseData.data.response || "...",
          sender: "ai",
          timestamp: new Date(),
          usedDocuments: finalResponseData.data.usedDocuments || false,
          documentSources: finalResponseData.data.documentSources || [],
          agentType: finalResponseData.data.agentType || "general",
          agentReasoning: finalResponseData.data.agentReasoning || null,
        };
      } else {
        // Handle unexpected final data
        setError(t("chat.failedToGetResponse"));
        hadErrorOrRateLimit = true; // Treat as error for cleanup
      }

      // **** Final State Update (Remains the same - removes all status messages) ****
      setMessages((prev) =>
        prev
          // 1. Filter out ALL temporary status messages for this request using collected IDs
          .filter((msg) => !statusMessageIds.includes(msg.id))
          // 2. Conditionally filter out the original user message if there was an error/rate limit
          .filter((msg) => !(hadErrorOrRateLimit && msg.id === userMessageId))
          // 3. Append the final AI response if it exists
          .concat(finalAiResponse ? [finalAiResponse] : [])
      );
    } catch (err) {
      console.error("Error during streaming or sending message:", err);
      setError(err.message || t("chat.failedToGetResponse"));
      // Clean up status messages AND the user message on catch
      setMessages((prev) =>
        prev.filter(
          (msg) =>
            !statusMessageIds.includes(msg.id) && msg.id !== userMessageId
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setSelectedImages([]);
  };

  const handleCopyMessage = (content, messageIndex) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedMessageId(messageIndex);
      setTimeout(() => setCopiedMessageId(null), 2000); // Reset after 2 seconds
    });
  };

  // Safe viewport height calculation accounting for mobile peculiarities
  const getContainerStyle = () => {
    const headerHeight = 48; // Fixed header height

    // Dynamic height calculation that works on desktop and mobile
    let containerHeight = `calc(100vh - ${headerHeight}px)`;

    // On iOS with dynamic navigation bars, we need to use viewport height
    if (window.visualViewport) {
      containerHeight = `${viewportHeight}px`;
    }

    return {
      height: containerHeight,
      paddingTop: `${headerHeight}px`,
      WebkitOverflowScrolling: "touch",
      overscrollBehavior: "contain",
    };
  };

  // Helper function to render individual system timeline items
  const renderSystemTimelineItem = (sysMsg, isCurrentStep) => {
    // Determine Icon based on whether it's the currently active step (if loading)
    const IconComponent = isCurrentStep ? Loader2 : Check;
    const iconColor = isCurrentStep
      ? "text-stone-400 animate-spin"
      : "text-green-600";
    // Optional: Add more specific icons based on sysMsg.step
    // Example: if (sysMsg.step === 'router_selected' && !isCurrentStep) IconComponent = Lightbulb;

    return (
      <div
        key={sysMsg.id}
        className="flex items-center gap-2.5 py-1 animate-fadeIn"
      >
        <IconComponent className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
        <span className="text-sm text-stone-700">{sysMsg.content}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full fixed inset-0 z-10">
      <div
        className={`flex-1 flex flex-col h-full w-full px-0 overflow-hidden 
          ${isSidebarExpanded ? "lg:pl-52" : "lg:pl-14"}`}
        style={getContainerStyle()}
      >
        {/* Chat Messages Container */}
        <div
          ref={chatContainerRef}
          className={`flex-1 overflow-y-auto p-4 pb-28 md:pb-32 space-y-4 bg-stone-50`}
          style={{
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            scrollPaddingBottom: keyboardVisible ? "80px" : "120px",
          }}
        >
          {groupedMessages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center py-10">
              <div
                className={`bg-stone-100 p-6 rounded-full mb-6 ${keyboardVisible ? "hidden sm:block" : "block"}`}
              >
                <Smile className="w-8 h-8 text-stone-600" />
              </div>
              <h3 className="text-3xl font-semibold text-stone-800 mb-3">
                {t("chat.greeting")}
              </h3>
              <div className="text-stone-600 text-sm mb-8">
                {t("chat.intro")}
                <div className="mt-3 text-amber-600 bg-amber-50 py-2 px-3 rounded-lg border border-amber-200 mx-auto max-w-[90%] sm:max-w-[85%] flex flex-col items-center">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="font-semibold">{t("chat.betaLabel")}</span>
                  </div>
                  <span className="text-center font-normal">
                    {t("chat.betaDisclaimer")}
                  </span>
                </div>
              </div>
              <div className="max-w-md mx-auto w-full space-y-3 px-4">
                <button className="w-full flex items-center gap-3 px-4 py-3 bg-white rounded-full border border-stone-200 hover:bg-stone-50 transition-colors text-left">
                  <Search className="w-5 h-5 text-stone-600" />
                  <div>
                    <div className="font-medium text-stone-800">
                      {t("chat.quickActions.answerQuestions.title")}
                    </div>
                    <div className="text-sm text-stone-600">
                      {t("chat.quickActions.answerQuestions.desc")}
                    </div>
                  </div>
                </button>

                <button className="w-full flex items-center gap-3 px-4 py-3 bg-white rounded-full border border-stone-200 hover:bg-stone-50 transition-colors text-left">
                  <Lightbulb className="w-5 h-5 text-stone-600" />
                  <div>
                    <div className="font-medium text-stone-800">
                      {t("chat.quickActions.explain.title")}
                    </div>
                    <div className="text-sm text-stone-600">
                      {t("chat.quickActions.explain.desc")}
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* **** Render Grouped Messages **** */}
          {groupedMessages.map((group) => {
            if (group.type === "system-group") {
              return (
                <div
                  key={group.id}
                  className="system-block-container my-3 p-4 bg-stone-50 border border-stone-200 rounded-lg shadow-sm max-w-2xl mx-auto w-full space-y-2"
                >
                  {/* Render each step in the timeline */}
                  {group.messages.map((sysMsg, sysMsgIndex) => {
                    // The last message in the group is the current step IF isLoading is true
                    const isLastInGroup =
                      sysMsgIndex === group.messages.length - 1;
                    return renderSystemTimelineItem(
                      sysMsg,
                      isLastInGroup && isLoading
                    );
                  })}
                </div>
              );
            } else {
              // group.type === 'message'
              const message = group.message;
              // Find the original index (needed for Message component logic like isLatestAIMessage)
              const originalIndex = messages.findIndex(
                (m) => m.id === message.id
              );
              return (
                <Message
                  // Use group.id which incorporates message id/timestamp
                  key={group.id}
                  message={message}
                  // Pass originalIndex if the Message component relies on it
                  index={originalIndex !== -1 ? originalIndex : 0}
                  messagesLength={messages.length}
                  copiedMessageId={copiedMessageId}
                  handleCopyMessage={handleCopyMessage}
                />
              );
            }
          })}

          {/* Error display */}
          {error && (
            <div className="flex justify-center max-w-3xl mx-auto w-full">
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 shadow-sm flex items-center space-x-2 max-w-[85%]">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} className="h-1" />
        </div>

        {/* Selected Image Previews */}
        {selectedImages.length > 0 && (
          <div
            className={`fixed left-0 right-0 mx-auto px-4 z-30 
              ${keyboardVisible ? "bottom-[52px]" : "bottom-[72px]"}
              ${isSidebarExpanded ? "lg:pl-52" : "lg:pl-14"}`}
            style={{ transition: "bottom 0.2s ease-out" }}
          >
            <div className="max-w-3xl mx-auto">
              <div className="bg-white rounded-t-xl shadow-[0_-2px_6px_rgba(0,0,0,0.05)] p-2 border border-stone-200 flex gap-2 overflow-x-auto">
                {selectedImages.map((image, index) => (
                  <div key={index} className="relative flex-shrink-0">
                    <img
                      src={image.displayUrl}
                      alt={`Upload ${index + 1}`}
                      className="h-16 object-cover rounded-lg border border-stone-200"
                    />
                    <button
                      onClick={() => removeImage(index)}
                      className="absolute -top-2 -right-2 bg-stone-800 text-white rounded-full p-0.5 shadow-md"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* "Start over" button */}
        {isNearBottom && !isLoading && messages.length > 0 && (
          <div
            className={`fixed mx-auto z-30 flex justify-center left-0 right-0
              ${keyboardVisible ? "bottom-[56px]" : "bottom-[76px]"}
              ${isSidebarExpanded ? "lg:pl-52" : "lg:pl-14"}`}
            style={{ transition: "bottom 0.2s ease-out" }}
          >
            <button
              onClick={handleClearChat}
              className="bg-white text-stone-700 text-xs font-medium px-3 py-1.5 rounded-full shadow-md border border-stone-200 hover:bg-stone-50 transition-colors flex items-center gap-1.5 animate-fadeIn transform-gpu"
              aria-label={t("chat.startOver")}
            >
              <Trash2 className="w-3 h-3" />
              <span>{t("chat.startOver")}</span>
            </button>
          </div>
        )}

        {/* Floating Message Input */}
        <div
          ref={inputContainerRef}
          className={`fixed left-0 right-0 mx-auto px-4 z-40
            ${keyboardVisible ? "bottom-0 pb-2" : "bottom-4"}
            ${isSidebarExpanded ? "lg:pl-52" : "lg:pl-14"}`}
          style={{ transition: "bottom 0.2s ease-out" }}
        >
          <div className="max-w-3xl mx-auto">
            <div className="bg-white rounded-2xl shadow-[0_3px_10px_rgba(0,0,0,0.15)] p-3 border border-stone-200">
              <div className="flex items-center space-x-2 w-full">
                {/* Plus button for attachments */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || selectedImages.length >= 2}
                  className="p-2.5 text-stone-600 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={t("chat.addAttachment")}
                  title={
                    selectedImages.length >= 2
                      ? t("chat.maxImages")
                      : t("chat.addImage")
                  }
                >
                  <Plus className="w-5 h-5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/heic, image/webp"
                  multiple
                  onChange={handleImageSelect}
                  className="hidden"
                  disabled={isLoading || selectedImages.length >= 2}
                  key={`file-input-${isLoading || selectedImages.length >= 2}`}
                />

                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={t("chat.inputPlaceholder")}
                  className="flex-1 py-2 border-0 bg-transparent outline-none text-base placeholder-stone-400"
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !isLoading &&
                      (inputMessage.trim() || selectedImages.length > 0)
                    ) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={isLoading}
                  autoComplete="off"
                />

                <button
                  onClick={handleSendMessage}
                  disabled={
                    (!inputMessage.trim() && selectedImages.length === 0) ||
                    isLoading
                  }
                  className="bg-gradient-to-r from-gray-800 to-gray-700 text-white p-2.5 rounded-lg shadow-md hover:from-gray-700 hover:to-gray-600 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:shadow-inner active:scale-95 focus:outline-none"
                  aria-label={t("chat.sendMessage")}
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll to bottom button */}
      {!isNearBottom && messages.length > 0 && (
        <button
          onClick={() => scrollToBottom(true)}
          className={`fixed right-4 bg-gradient-to-r from-gray-800 to-gray-700 text-white p-2 rounded-full shadow-lg hover:from-gray-700 hover:to-gray-600 transition-all duration-150 active:scale-95 z-30
            ${keyboardVisible ? "bottom-16" : "bottom-24"}`}
          style={{ transition: "bottom 0.2s ease-out" }}
          aria-label={t("chat.scrollToBottom")}
        >
          <ArrowDown className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

ChatPage.propTypes = {
  isSidebarExpanded: PropTypes.bool,
};

export default ChatPage;
