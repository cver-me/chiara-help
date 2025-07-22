import { cn } from "../../lib/utils";
import { useEffect, useState } from "react";
import PropTypes from "prop-types";

export const BackgroundGradientAnimation = ({
  children,
  // `className` applies to the inner content overlay,
  // while `containerClassName` is merged with the outer container.
  className = "",
  containerClassName = "",
}) => {
  // Static configuration for a static page
  const gradientBackgroundStart = "rgb(245, 245, 244)";
  const gradientBackgroundEnd = "rgb(250, 250, 249)";
  const firstColor = "45, 212, 191"; // teal-400
  const secondColor = "251, 191, 36"; // amber-400
  const thirdColor = "96, 165, 250"; // blue-400
  const fourthColor = "167, 139, 250"; // violet-400
  const size = "150%";
  const blendingValue = "soft-light";

  const [browser, setBrowser] = useState("unknown");

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
      setBrowser("safari");
    } else if (/chrome/i.test(ua) && /google/i.test(navigator.vendor)) {
      setBrowser("chrome");
    } else {
      setBrowser("other");
    }
  }, []);

  return (
    <div
      className={cn("relative overflow-hidden", containerClassName)}
      style={{
        background: `linear-gradient(${gradientBackgroundStart}, ${gradientBackgroundEnd})`,
        "--first-color": firstColor,
        "--second-color": secondColor,
        "--third-color": thirdColor,
        "--fourth-color": fourthColor,
        "--size": size,
        "--blending-value": blendingValue,
      }}
    >
      <div className={cn("relative z-10", className)}>{children}</div>
      <div
        className={cn(
          "absolute inset-0 w-full h-full",
          browser === "safari" || browser === "chrome"
            ? "blur-2xl"
            : "[filter:url(#blurMe)_blur(40px)]"
        )}
        style={{
          willChange: "transform",
          contain: "paint",
        }}
      >
        <div
          className={cn(
            "absolute [background:radial-gradient(circle_at_center,_rgba(var(--first-color),_0.8)_0,_rgba(var(--first-color),_0)_50%)_no-repeat]",
            browser !== "chrome" && "[mix-blend-mode:var(--blending-value)]",
            "w-[var(--size)] h-[var(--size)] top-[calc(50% - var(--size)/2)] left-[calc(50% - var(--size)/2)]",
            "[transform-origin:center_center]",
            "animate-first",
            "opacity-50"
          )}
        />
        <div
          className={cn(
            "absolute [background:radial-gradient(circle_at_center,_rgba(var(--second-color),_0.8)_0,_rgba(var(--second-color),_0)_50%)_no-repeat]",
            browser !== "chrome" && "[mix-blend-mode:var(--blending-value)]",
            "w-[var(--size)] h-[var(--size)] top-[calc(50% - var(--size)/2)] left-[calc(50% - var(--size)/2)]",
            "[transform-origin:calc(50% - 400px)]",
            "animate-second",
            "opacity-50"
          )}
        />
        <div
          className={cn(
            "absolute [background:radial-gradient(circle_at_center,_rgba(var(--third-color),_0.8)_0,_rgba(var(--third-color),_0)_50%)_no-repeat]",
            browser !== "chrome" && "[mix-blend-mode:var(--blending-value)]",
            "w-[var(--size)] h-[var(--size)] top-[calc(50% - var(--size)/2)] left-[calc(50% - var(--size)/2)]",
            "[transform-origin:calc(50% + 400px)]",
            "animate-third",
            "opacity-50"
          )}
        />
        <div
          className={cn(
            "absolute [background:radial-gradient(circle_at_center,_rgba(var(--fourth-color),_0.8)_0,_rgba(var(--fourth-color),_0)_50%)_no-repeat]",
            browser !== "chrome" && "[mix-blend-mode:var(--blending-value)]",
            "w-[var(--size)] h-[var(--size)] top-[calc(50% - var(--size)/2)] left-[calc(50% - var(--size)/2)]",
            "[transform-origin:calc(50% - 200px)]",
            "animate-fourth",
            "opacity-50"
          )}
        />
      </div>

      {!(browser === "safari" || browser === "chrome") && (
        <svg style={{ position: "fixed", height: 0, width: 0 }}>
          <defs>
            <filter id="blurMe">
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation="10"
                result="blur"
              />
              <feColorMatrix
                in="blur"
                mode="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
                result="goo"
              />
            </filter>
          </defs>
        </svg>
      )}
    </div>
  );
};

BackgroundGradientAnimation.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
  containerClassName: PropTypes.string,
};
