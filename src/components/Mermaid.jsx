import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import mermaid from "mermaid";
import Panzoom from "@panzoom/panzoom";
import { ensureValidMindmapSyntax } from "../utils/mindmapUtils";
import { useTranslation } from "react-i18next";

// Initialize mermaid with custom config
mermaid.initialize({
  startOnLoad: false, // Important to prevent auto-rendering

  securityLevel: "loose", // Required for some rendering operations
  fontFamily: "Outfit, system-ui, sans-serif", // Fallback to system fonts if Inter is not available
  fontSize: 10,
  fontWeight: "normal",
});

const Mermaid = ({
  chart,
  externalZoomIn,
  externalZoomOut,
  externalResetView,
}) => {
  const containerRef = useRef(null);
  const panzoomInstanceRef = useRef(null);
  const [renderError, setRenderError] = useState(null);
  const [isAutofixed, setIsAutofixed] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (externalZoomIn) {
      const zoomIn = () => {
        if (panzoomInstanceRef.current) {
          panzoomInstanceRef.current.zoomIn();
        }
      };
      externalZoomIn.current = zoomIn;
    }
    if (externalZoomOut) {
      const zoomOut = () => {
        if (panzoomInstanceRef.current) {
          panzoomInstanceRef.current.zoomOut();
        }
      };
      externalZoomOut.current = zoomOut;
    }
    if (externalResetView) {
      const resetView = () => {
        if (panzoomInstanceRef.current) {
          panzoomInstanceRef.current.reset();
        }
      };
      externalResetView.current = resetView;
    }
  }, [externalZoomIn, externalZoomOut, externalResetView]);

  useEffect(() => {
    let timer;

    const renderChart = async () => {
      // Destroy existing Panzoom instance before rendering new chart
      if (panzoomInstanceRef.current) {
        panzoomInstanceRef.current.destroy();
        panzoomInstanceRef.current = null;
      }

      if (containerRef.current && chart) {
        let renderSuccess = false;
        let svgElement = null;
        const id = `mermaid-${Math.random().toString(36).substring(2, 10)}`;

        try {
          // 1. Create the target div with the ID AND the chart text inside
          containerRef.current.innerHTML = `
              <style>
                 #${id} { cursor: grab; overflow: visible !important; }
                 #${id}:active { cursor: grabbing; }
                 /* Add necessary base styles - Mermaid applies others */
                 .mermaid .mindmap .node text { font-family: Inter, system-ui, sans-serif !important; font-size: 20px !important; }
                 .mermaid .mindmap .node ellipse, .mermaid .mindmap .node rect, .mermaid .mindmap .node circle, .mermaid .mindmap .node polygon { stroke-width: 2px; }
                 .mermaid .mindmap .edge { stroke-width: 2px; }
              </style>
              <div id="${id}" class="mermaid" style="display: flex; justify-content: center; align-items: center; height: 100%; width: 100%;">
${chart}
              </div>
              `;

          const targetElement = containerRef.current.querySelector(`#${id}`);
          if (!targetElement) {
            throw new Error(t("mermaid.errors.targetElementNotFound", { id }));
          }

          // 2. Render the chart using mermaid.run() on the specific element
          await mermaid.run({ nodes: [targetElement] });

          // 3. Find the generated SVG *after* run()
          svgElement = targetElement.querySelector("svg");
          if (!svgElement) {
            // Check if Mermaid added an error message instead
            const errorNode = targetElement.querySelector(
              '[data-mermaid-error="true"]'
            );
            if (errorNode) {
              throw new Error(
                t("mermaid.errors.mermaidRenderFailed", {
                  error: errorNode.textContent || t("mermaid.errors.unknown"),
                })
              );
            }
            throw new Error(t("mermaid.errors.svgNotFound", { id }));
          }

          renderSuccess = true;
        } catch (renderError) {
          console.warn(
            "Initial Mermaid rendering (mermaid.run) failed, attempting fix...",
            renderError
          );
        }

        // --- Fallback Fix Path (using mermaid.run as well) ---
        if (!renderSuccess) {
          const fixedChart = ensureValidMindmapSyntax(chart);
          const fixedId = id + "-fixed";

          console.log(
            "Initial render failed. Attempting fix render with ID:",
            fixedId,
            "\nFixed Chart:\n",
            fixedChart
          );

          // 1. Create the target div for the fixed attempt with text inside
          containerRef.current.innerHTML = `
              <style>
                 #${fixedId} { cursor: grab; overflow: visible !important; }
                 #${fixedId}:active { cursor: grabbing; }
                 /* Add necessary base styles again */
                 .mermaid .mindmap .node text { font-family: Inter, system-ui, sans-serif !important; font-size: 20px !important; }
                 .mermaid .mindmap .node ellipse, .mermaid .mindmap .node rect, .mermaid .mindmap .node circle, .mermaid .mindmap .node polygon { stroke-width: 2px; }
                 .mermaid .mindmap .edge { stroke-width: 2px; }
              </style>
              <div id="${fixedId}" class="mermaid" style="height: 100%; width: 100%;">
${fixedChart}
              </div>
              `;
          const targetElementFixed = containerRef.current.querySelector(
            `#${fixedId}`
          );
          if (!targetElementFixed) {
            setRenderError(
              t("mermaid.errors.targetElementNotFoundFix", { id: fixedId })
            );
            // No return here, let Panzoom logic handle potential null svgElement
          } else {
            try {
              console.log(
                "Executing fix render using mermaid.run() on element:",
                targetElementFixed
              );
              // 2. Render the fixed chart using mermaid.run()
              await mermaid.run({ nodes: [targetElementFixed] });

              // 3. Find the generated SVG *after* run()
              svgElement = targetElementFixed.querySelector("svg");
              if (!svgElement) {
                const errorNode = targetElementFixed.querySelector(
                  '[data-mermaid-error="true"]'
                );
                if (errorNode) {
                  throw new Error(
                    t("mermaid.errors.mermaidFixFailed", {
                      error:
                        errorNode.textContent || t("mermaid.errors.unknown"),
                    })
                  );
                }
                throw new Error(
                  t("mermaid.errors.svgNotFoundFix", { id: fixedId })
                );
              }
              setIsAutofixed(true);
            } catch (finalError) {
              console.error(
                "Mermaid rendering failed even after fix:",
                finalError
              );
              setRenderError(
                finalError.message || t("mermaid.errors.renderFailedAfterFix")
              );
              if (targetElementFixed) {
                targetElementFixed.innerHTML = `
                          <div class="p-4 text-red-600 bg-red-50 rounded-lg">
                            ${t("mermaid.errors.renderErrorDisplay", {
                              message:
                                finalError.message ||
                                t("mermaid.errors.unknown"),
                            })}
                          </div>
                       `;
              }
              svgElement = null; // Ensure no panzoom init on error
            }
          } // End of else block for targetElementFixed check
        } // End of if (!renderSuccess) block

        // Panzoom initialization (ensure it runs only if svgElement was found)
        if (svgElement) {
          setTimeout(() => {
            // Ensure the element still exists in the DOM within the timeout
            if (!document.body.contains(svgElement)) {
              console.warn(
                "SVG element detached from DOM before Panzoom initialization."
              );
              return;
            }

            // Style the SVG element itself for better panzoom integration
            svgElement.style.maxWidth = "none";
            svgElement.style.height = "auto";
            svgElement.style.display = "block";
            svgElement.setAttribute("width", "100%");
            svgElement.setAttribute("height", "100%");
            svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");

            const panzoomContainer = containerRef.current;

            if (
              panzoomInstanceRef.current &&
              panzoomInstanceRef.current.element === svgElement
            ) {
              console.log(
                "Panzoom instance already exists, skipping re-initialization."
              );
            } else {
              if (panzoomInstanceRef.current) {
                panzoomInstanceRef.current.destroy();
              }

              panzoomInstanceRef.current = Panzoom(svgElement, {
                maxScale: 5,
                minScale: 0.3,
                step: 0.15,
                canvas: true,
              });

              if (panzoomContainer) {
                if (!panzoomContainer.dataset.wheelListenerAdded) {
                  panzoomContainer.addEventListener(
                    "wheel",
                    (event) => {
                      if (panzoomInstanceRef.current && !event.ctrlKey) {
                        panzoomInstanceRef.current.zoomWithWheel(event);
                      }
                      event.preventDefault();
                    },
                    { passive: false }
                  );
                  panzoomContainer.dataset.wheelListenerAdded = "true";
                }
              }
            }
          }, 0);
        } else {
          // Explicitly handle case where svgElement is null after both attempts
          if (!renderError) {
            // Avoid overwriting specific render error
            setRenderError(t("mermaid.errors.svgRenderFailed"));
          }
        }
      } // End of if (containerRef.current && chart) block
    }; // End of renderChart function

    // Clear any existing timer
    clearTimeout(timer);

    // Set a small delay to ensure proper cleanup between renders
    timer = setTimeout(() => {
      renderChart();
    }, 50);

    // Cleanup function
    return () => {
      clearTimeout(timer);
      // Destroy Panzoom instance on unmount or chart change
      if (panzoomInstanceRef.current) {
        panzoomInstanceRef.current.destroy();
        panzoomInstanceRef.current = null;
      }
      // Clean up wheel listener if added
      if (
        containerRef.current &&
        containerRef.current.dataset.wheelListenerAdded
      ) {
        // Note: Removing specific listener requires storing the handler function reference
        // For simplicity here, we'll just remove the flag, assuming component remount handles full cleanup.
        // A more robust solution would store the handler and call removeEventListener.
        delete containerRef.current.dataset.wheelListenerAdded;
      }
    };
  }, [chart, t]); // Add t to dependency array

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div
        ref={containerRef}
        className="flex-1 w-full h-full overflow-visible cursor-grab active:cursor-grabbing"
      >
        {/* Content rendered dynamically by useEffect */}
        {renderError && (
          <div className="p-4 text-sm text-gray-500 flex items-center justify-center h-full">
            <div>
              {t("mermaid.renderError.unableToRender")}
              <pre className="mt-2 text-xs overflow-auto max-h-40 bg-gray-100 p-2 rounded">
                {renderError}
              </pre>
            </div>
          </div>
        )}
      </div>
      {/* Status Messages */}
      <div className="p-2 text-center">
        {isAutofixed && !renderError && (
          <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded inline-block">
            {t("mermaid.autoFixNote")}
          </div>
        )}
      </div>
    </div>
  );
};

Mermaid.propTypes = {
  chart: PropTypes.string.isRequired,
  externalZoomIn: PropTypes.object,
  externalZoomOut: PropTypes.object,
  externalResetView: PropTypes.object,
};

export default Mermaid;
