import {
  ArrowRight,
  BookOpen,
  Brain,
  Sparkles,
  NotebookTabs,
  Presentation,
} from "lucide-react";
import { useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation, Trans } from "react-i18next";
import {
  trackPageView,
  trackCTAClick,
  createSectionObserver,
} from "../utils/analytics.js";

import StudyAidGeneratorDemo from "../components/demo/StudyAidGeneratorDemo.jsx";
import InteractiveAITutorDemo from "../components/demo/InteractiveAITutorDemo.jsx";
import EnhancedDocumentEngagementDemo from "../components/demo/EnhancedDocumentEngagementDemo.jsx";

export default function LandingPage() {
  const { t } = useTranslation();

  // Create section refs at the top level
  const frameworkRef = useRef(null);
  const featuresRef = useRef(null);
  const testimonialsRef = useRef(null);
  const ctaRef = useRef(null);

  // Combine the refs into a single object (memoized so it remains stable)
  const sectionRefs = useMemo(
    () => ({
      framework: frameworkRef,
      features: featuresRef,
      testimonials: testimonialsRef,
      cta: ctaRef,
    }),
    []
  );

  useEffect(() => {
    // Track page view
    trackPageView("landing_page");

    // Set up section observers with proper cleanup
    const observers = [];
    Object.entries(sectionRefs).forEach(([name, ref]) => {
      if (ref.current) {
        const observer = createSectionObserver(name + "_section");
        observer.observe(ref.current);
        observers.push(observer);
      }
    });

    // Cleanup all observers on unmount
    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [sectionRefs]);

  // Memoize event handlers
  const handleCTAClick = useCallback((ctaName, location) => {
    trackCTAClick(ctaName, location);
  }, []);

  // Memoize static arrays for rendering lists
  const frameworkSteps = useMemo(
    () => [
      {
        icon: <NotebookTabs className="w-6 h-6" />,
        title: t("step1_title"),
        desc: t("step1_desc"),
        step: t("step1_label"),
      },
      {
        icon: <Brain className="w-6 h-6" />,
        title: t("step2_title"),
        desc: t("step2_desc"),
        step: t("step2_label"),
      },
      {
        icon: <BookOpen className="w-6 h-6" />,
        title: t("step3_title"),
        desc: t("step3_desc"),
        step: t("step3_label"),
      },
      {
        icon: <Presentation className="w-6 h-6" />,
        title: t("step4_title"),
        desc: t("step4_desc"),
        step: t("step4_label"),
      },
    ],
    [t]
  );

  const universitiesList = useMemo(
    () => [
      { src: "/images/universities/polimi.svg", alt: "Politecnico di Milano" },
      { src: "/images/universities/bocconi.svg", alt: "Università Bocconi" },
      { src: "/images/universities/unibo.svg", alt: "Università di Bologna" },
      { src: "/images/universities/unicatt.svg", alt: "Università Cattolica" },
      {
        src: "/images/universities/ucb.svg",
        alt: "University of California, Berkeley",
      },
      {
        src: "/images/universities/fs.svg",
        alt: "Frankfurt School of Finance & Management",
      },
    ],
    []
  );

  return (
    <main role="main">
      <div className="min-h-screen bg-stone-100">
        {/* Navigation */}
        <nav
          className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-200/50 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
          role="navigation"
          aria-label="Main navigation"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <a href="/" className="flex items-center gap-3 group">
                <div className="flex items-center gap-2">
                  <span className="font-display text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-stone-900 to-stone-700">
                    Chiara
                  </span>
                  <span className="px-2 py-0.5 bg-gradient-to-r from-amber-50 to-stone-50 text-stone-600 text-xs rounded-full font-medium border border-stone-200">
                    Beta
                  </span>
                </div>
              </a>
              <div className="flex items-center gap-6">
                <a
                  href="/login"
                  className="hidden sm:inline-block text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
                >
                  {t("sign_in")}
                </a>
                <a
                  href="/login"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-b from-stone-800 to-stone-900 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.15)] hover:from-stone-700 hover:to-stone-800 transition-all duration-150 active:scale-[0.98] active:shadow-[0_1px_4px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.15)]"
                >
                  {t("get_started")}
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="relative h-auto min-h-[50vh] sm:h-[65vh] overflow-hidden border-b border-stone-200/50">
          {/* Background color gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-amber-50/40 to-amber-50/20" />

          {/* Grid pattern */}
          <div
            className="absolute inset-0 z-[1] bg-transparent bg-[linear-gradient(to_right,theme(colors.stone.200/3)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.stone.200/3)_1px,transparent_1px)] bg-[size:20px_20px]"
            style={{ backgroundPosition: "top left" }}
          />

          {/* Decorative educational elements */}
          <div className="absolute inset-0 overflow-hidden z-10">
            {/* Books emoji */}
            <div className="absolute top-[20%] right-[6%] md:top-[15%] md:right-[10%] transform rotate-12 opacity-30 select-none">
              <span
                className="text-4xl md:text-6xl"
                role="img"
                aria-label="Notes"
              >
                📝
              </span>
            </div>

            {/* Graduation cap emoji */}
            <div className="absolute bottom-[52%] left-[7%] md:bottom-[20%] md:left-[10%] transform -rotate-12 opacity-15 select-none">
              <span
                className="text-3xl md:text-7xl"
                role="img"
                aria-label="Graduation Cap"
              >
                🎓
              </span>
            </div>

            {/* Microscope emoji */}
            <div className="absolute top-[17%] left-[14%] md:top-[18%] md:left-[18%] transform opacity-25 select-none">
              <span
                className="text-4xl md:text-6xl"
                role="img"
                aria-label="Microscope"
              >
                🔬
              </span>
            </div>

            {/* Test tube emoji */}
            <div className="absolute bottom-[50%] right-[12%] md:bottom-[12%] md:right-[23%] transform -rotate-2 opacity-20 select-none">
              <span
                className="text-3xl md:text-5xl"
                role="img"
                aria-label="Test Tube"
              >
                🧪
              </span>
            </div>
          </div>

          {/* Subtle paper texture */}
          <div className="absolute inset-0 opacity-[0.04] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1IiBoZWlnaHQ9IjUiPgo8cmVjdCB3aWR0aD0iNSIgaGVpZ2h0PSI1IiBmaWxsPSIjZmZmZmYwIj48L3JlY3Q+CjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNkNmJjOGQiPjwvcmVjdD4KPC9zdmc+')]" />

          {/* Soft vignette effect */}
          <div className="absolute inset-0 shadow-[inset_0_0_140px_rgba(217,180,120,0.05)]" />
          <div className="relative z-10 pt-28 pb-12 px-4 sm:pt-32 sm:pb-12 max-w-7xl mx-auto">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 bg-white/60 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-medium text-stone-800 shadow-sm border border-amber-200/30 mb-8">
                <Sparkles className="w-4 h-4" />
                <span>{t("early_access")}</span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-stone-900 tracking-tight mb-8">
                <Trans i18nKey="hero_title">
                  Learning Should Work For
                  <span className="font-semibold underline decoration-stone-700 decoration-double decoration-2 underline-offset-4">
                    Everyone
                  </span>
                </Trans>
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-stone-800 max-w-2xl mx-auto">
                {t("hero_subtitle")}
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center items-center sm:items-baseline">
                <a
                  href="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center whitespace-nowrap gap-2 px-6 py-3 text-base font-medium text-white bg-gradient-to-b from-stone-800 to-stone-900 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.15)] hover:from-stone-700 hover:to-stone-800 transition-all duration-150 active:scale-[0.98] active:shadow-[0_1px_4px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.15)]"
                  onClick={() => handleCTAClick("get_started", "hero_section")}
                >
                  {t("try_it_out")}
                  <ArrowRight className="w-5 h-5" />
                </a>
                <p className="text-sm text-stone-500 whitespace-nowrap">
                  {t("free_development")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* University Logos Section */}
        <section
          ref={sectionRefs.testimonials}
          className="py-8 bg-gradient-to-b from-stone-50 to-white border-y border-stone-200/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]"
          aria-label="Universities"
        >
          <div className="max-w-7xl mx-auto px-4">
            <p className="text-center text-stone-600 mb-12 text-sm font-medium">
              {t("universities_subtitle")}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 items-center justify-items-center">
              {universitiesList.map((uni, i) => (
                <div
                  key={i}
                  className="w-full max-w-[180px] flex items-center justify-center grayscale hover:grayscale-0 transition-all opacity-70 hover:opacity-100"
                >
                  <img
                    src={uni.src}
                    alt={uni.alt}
                    className="h-12 md:h-16 lg:h-20 w-auto object-contain"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Framework Section */}
        <section
          ref={sectionRefs.framework}
          className="py-16 sm:py-20 bg-stone-50 relative overflow-hidden border-b border-stone-200/50"
        >
          {/* Subtle paper texture overlay - can be kept or removed depending on overall design consistency */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-stone-900 mb-4 [text-shadow:0_1px_1px_rgba(255,255,255,0.8)]">
                {t("framework_title")}
              </h2>
              <p className="text-stone-600 max-w-2xl mx-auto">
                {t("framework_subtitle")}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {frameworkSteps.map((item, i) => (
                <div key={i} className="relative h-full">
                  <div
                    className={`p-6 rounded-2xl h-full flex flex-col transform-gpu perspective-1000 bg-white shadow-lg hover:shadow-xl border border-stone-200/80 transition-all duration-300 ease-out hover:scale-[1.02]`}
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-transparent shadow-md transition-all duration-300 ease-out
                          ${i === 0 ? "text-blue-600" : ""}
                          ${i === 1 ? "text-purple-600" : ""}
                          ${i === 2 ? "text-teal-600" : ""}
                          ${i === 3 ? "text-amber-600" : ""}
                        `}
                      >
                        <div className="text-inherit drop-shadow-sm">
                          {item.icon}
                        </div>
                      </div>
                      <div>
                        <div
                          className={`text-xs font-medium mb-1 [text-shadow:0_1px_0_rgba(255,255,255,0.8)]
                            ${i === 0 ? "text-blue-600/90" : ""}
                            ${i === 1 ? "text-purple-600/90" : ""}
                            ${i === 2 ? "text-teal-600/90" : ""}
                            ${i === 3 ? "text-amber-600/90" : ""}
                          `}
                        >
                          {item.step}
                        </div>
                        <h3 className="text-lg font-semibold text-stone-900 [text-shadow:0_1px_0_rgba(255,255,255,0.8)]">
                          {item.title}
                        </h3>
                      </div>
                    </div>
                    <p className="text-stone-600 flex-1">{item.desc}</p>
                    {i < 3 && (
                      <div className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 text-stone-300/70 z-10 drop-shadow-sm">
                        <ArrowRight className="w-6 h-6" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Product Demo Section */}
        <section className="py-16 sm:py-20 px-4 bg-gradient-to-b from-white to-stone-50 relative before:absolute before:inset-0 before:bg-[linear-gradient(120deg,transparent_0%,rgba(0,0,0,0.02)_50%,transparent_100%)]">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-stone-900 mb-4">
                {t("product_demo_title")}
              </h2>
              <p className="text-stone-600 max-w-2xl mx-auto">
                {t("product_demo_subtitle")}
              </p>
            </div>
            <div className="space-y-8 md:space-y-12">
              <InteractiveAITutorDemo />
              <StudyAidGeneratorDemo />
              <EnhancedDocumentEngagementDemo />
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section
          ref={sectionRefs.cta}
          className="py-16 sm:py-20 px-4 bg-gradient-to-b from-white to-stone-50 border-y border-stone-200/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] relative before:absolute before:inset-0 before:pointer-events-none before:bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.02)_100%)]"
        >
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight">
              {t("cta_title")}
            </h2>
            <p className="mt-4 text-lg text-stone-600">{t("cta_subtitle")}</p>
            <div className="mt-8 flex flex-col items-center gap-4">
              <a
                href="/login"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-base font-medium text-white bg-gradient-to-b from-stone-800 to-stone-900 rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.15)] hover:from-stone-700 hover:to-stone-800 transition-all duration-150 active:scale-[0.98] active:shadow-[0_1px_4px_rgba(0,0,0,0.1),inset_0_1px_1px_rgba(255,255,255,0.15)]"
                onClick={() => handleCTAClick("get_started", "cta_section")}
              >
                {t("cta_button")}
                <ArrowRight className="w-5 h-5" />
              </a>
              <p className="text-sm text-stone-500">{t("cta_free")}</p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 bg-[linear-gradient(180deg,#fafaf9,#f5f5f4)] relative overflow-hidden border-t border-stone-200/50">
          {/* Subtle paper texture overlay */}
          <div className="absolute inset-0 opacity-[0.05] pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.02))] pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 relative">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-white/40 backdrop-blur-[2px] px-3 py-1.5 rounded-xl shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]">
                  <span className="text-sm text-stone-600 [text-shadow:0_1px_0_rgba(255,255,255,0.8)]">
                    &copy; 2025 Chiara
                  </span>
                  <span className="text-xs text-stone-500">
                    by{" "}
                    <a
                      href="https://cver.me"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-stone-600 hover:text-stone-900 transition-colors"
                    >
                      cver.me
                    </a>
                  </span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-4 bg-white/40 backdrop-blur-[2px] px-4 py-1.5 rounded-xl shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)]">
                    <a
                      href="/legal/tos.txt"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-stone-600 hover:text-stone-900 transition-colors [text-shadow:0_1px_0_rgba(255,255,255,0.8)]"
                    >
                      {t("footer_tos")}
                    </a>
                    <span className="text-stone-300/80">·</span>
                    <a
                      href="/legal/pp.txt"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-stone-600 hover:text-stone-900 transition-colors [text-shadow:0_1px_0_rgba(255,255,255,0.8)]"
                    >
                      {t("footer_privacy")}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
