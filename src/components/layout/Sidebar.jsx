import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  NotebookTabs,
  ChevronLeft,
  Menu,

  // Brain,
  // BookOpen,
  // Presentation,
  Sparkles,
  MessagesSquare,
} from "lucide-react";
import PropTypes from "prop-types";
import CreateModal from "../CreateModal";
import { useTranslation } from "react-i18next";

const Sidebar = ({ isExpanded, setIsExpanded }) => {
  const { t } = useTranslation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const location = useLocation();

  const toggleSidebar = () => {
    setIsExpanded(!isExpanded);
  };

  const isActivePath = (path) => {
    return location.pathname === path;
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="fixed top-0 left-0 h-12 w-12 lg:hidden z-50">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="flex items-center justify-center w-full h-full"
        >
          <Menu className="w-4.5 h-4.5 text-gray-600" />
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 lg:hidden z-30"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-12 left-0 h-[calc(100vh-48px)] bg-white border-r border-gray-200 transition-all duration-300 ease-in-out z-40
          ${isExpanded ? "w-52" : "w-14"} 
          lg:translate-x-0
          ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Navigation Links */}
          <nav className="flex flex-col p-2 space-y-1.5">
            {/* Generate Button */}
            <button
              onClick={() => {
                setIsCreateModalOpen(true);
                setIsMobileMenuOpen(false);
              }}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg shadow-sm
                bg-gradient-to-r from-rose-400 via-fuchsia-400 to-indigo-400 text-white
                hover:from-rose-500 hover:via-fuchsia-500 hover:to-indigo-500
                active:from-rose-600 active:via-fuchsia-600 active:to-indigo-600
                transition-all duration-200 ease-in-out ${isExpanded ? "justify-start" : "justify-center"}
                group relative`}
            >
              <Sparkles className="w-4.5 h-4.5 shrink-0" />
              {isExpanded ? (
                <span className="text-sm font-medium">
                  {t("sidebar.generate")}
                </span>
              ) : (
                <span
                  className="absolute left-full top-0 ml-2 px-2 py-1 text-sm font-medium text-gray-900 bg-white rounded-md 
                    shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-50"
                >
                  {t("sidebar.generate")}
                </span>
              )}
            </button>

            <div className="h-px bg-gray-200 my-1" />

            {/* Navigation Group */}
            <div className="space-y-0.5">
              <Link
                to="/study-material"
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg
                  transition-all duration-200 ease-in-out ${isExpanded ? "justify-start" : "justify-center"}
                  group relative
                  ${
                    isActivePath("/study-material")
                      ? "bg-stone-50 text-stone-700"
                      : "text-gray-700 hover:bg-stone-50/60 hover:text-stone-600 active:bg-stone-50/80"
                  }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <NotebookTabs
                  className={`w-4.5 h-4.5 shrink-0 transition-colors duration-200
                  ${isActivePath("/study-material") ? "text-stone-600" : "text-gray-600 group-hover:text-stone-600"}`}
                />
                {isExpanded ? (
                  <span className="text-sm font-medium">
                    {t("sidebar.studyMaterial")}
                  </span>
                ) : (
                  <span
                    className="absolute left-full top-0 ml-2 px-2 py-1 text-sm font-medium text-gray-900 bg-white rounded-md 
                    shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-50"
                  >
                    {t("sidebar.studyMaterial")}
                  </span>
                )}
              </Link>
              <Link
                to="/chat"
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg
                  transition-all duration-200 ease-in-out ${isExpanded ? "justify-start" : "justify-center"}
                  group relative
                  ${
                    isActivePath("/chat")
                      ? "bg-stone-50 text-stone-700"
                      : "text-gray-700 hover:bg-stone-50/60 hover:text-stone-600 active:bg-stone-50/80"
                  }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <MessagesSquare
                  className={`w-4.5 h-4.5 shrink-0 transition-colors duration-200
                  ${isActivePath("/chat") ? "text-stone-600" : "text-gray-600 group-hover:text-stone-600"}`}
                />
                {isExpanded ? (
                  <span className="text-sm font-medium">
                    {t("sidebar.chat")}
                  </span>
                ) : (
                  <span
                    className="absolute left-full top-0 ml-2 px-2 py-1 text-sm font-medium text-gray-900 bg-white rounded-md 
                    shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-50"
                  >
                    {t("sidebar.chat")}
                  </span>
                )}
              </Link>
              {/* <Link
                to="/comprehend"
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg
                  transition-all duration-200 ease-in-out ${isExpanded ? "justify-start" : "justify-center"}
                  group relative
                  ${
                    isActivePath("/comprehend")
                      ? "bg-purple-50 text-purple-700"
                      : "text-gray-700 hover:bg-purple-50/60 hover:text-purple-600 active:bg-purple-50/80"
                  }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Brain
                  className={`w-4.5 h-4.5 shrink-0 transition-colors duration-200
                  ${isActivePath("/comprehend") ? "text-purple-600" : "text-gray-600 group-hover:text-purple-600"}`}
                />
                {isExpanded ? (
                  <span className="text-sm font-medium">Comprehension</span>
                ) : (
                  <span
                    className="absolute left-full top-0 ml-2 px-2 py-1 text-sm font-medium text-gray-900 bg-white rounded-md 
                    shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-50"
                  >
                    Comprehension
                  </span>
                )}
              </Link> */}

              {/* <Link
                to="/memorize"
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg
                  transition-all duration-200 ease-in-out ${isExpanded ? "justify-start" : "justify-center"}
                  group relative
                  ${
                    isActivePath("/memorize")
                      ? "bg-teal-50 text-teal-700"
                      : "text-gray-700 hover:bg-teal-50/60 hover:text-teal-600 active:bg-teal-50/80"
                  }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <BookOpen
                  className={`w-4.5 h-4.5 shrink-0 transition-colors duration-200
                  ${isActivePath("/memorize") ? "text-teal-600" : "text-gray-600 group-hover:text-teal-600"}`}
                />
                {isExpanded ? (
                  <span className="text-sm font-medium">Memorization</span>
                ) : (
                  <span
                    className="absolute left-full top-0 ml-2 px-2 py-1 text-sm font-medium text-gray-900 bg-white rounded-md 
                    shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-50"
                  >
                    Memorization
                  </span>
                )}
              </Link> */}

              {/* <Link
                to="#"
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg
                  transition-all duration-200 ease-in-out ${isExpanded ? "justify-start" : "justify-center"}
                  group relative opacity-50 cursor-not-allowed
                  ${
                    isActivePath("#")
                      ? "bg-amber-50 text-amber-700"
                      : "text-gray-700 hover:bg-amber-50/60 hover:text-amber-600 active:bg-amber-50/80"
                  }`}
              >
                <Presentation
                  className={`w-4.5 h-4.5 shrink-0 transition-colors duration-200
                  ${isActivePath("#") ? "text-amber-600" : "text-gray-600 group-hover:text-amber-600"}`}
                />
                {isExpanded ? (
                  <span className="text-sm font-medium">Presentation</span>
                ) : (
                  <span
                    className="absolute left-full top-0 ml-2 px-2 py-1 text-sm font-medium text-gray-900 bg-white rounded-md 
                    shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-50"
                  >
                    Presentation
                  </span>
                )}
              </Link> */}
            </div>
          </nav>

          {/* Toggle Button */}
          <div className="mt-auto p-2 border-t border-gray-200">
            <button
              onClick={toggleSidebar}
              className="hidden lg:flex items-center justify-center w-full p-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <ChevronLeft
                className={`w-4.5 h-4.5 text-gray-600 transition-transform duration-300 ${
                  isExpanded ? "" : "rotate-180"
                }`}
              />
            </button>
          </div>
        </div>
      </aside>

      {/* Create Modal */}
      <CreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        fileData={null}
      />
    </>
  );
};

Sidebar.propTypes = {
  isExpanded: PropTypes.bool.isRequired,
  setIsExpanded: PropTypes.func.isRequired,
};

export default Sidebar;
