import { useEffect } from "react";
import PropTypes from "prop-types";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
  Font,
} from "@react-pdf/renderer";
import { ref, getDownloadURL } from "firebase/storage";
import { storage } from "../../utils/firebase";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import katex from "katex";
import "katex/dist/katex.min.css";

// Register Inter font from local files
Font.register({
  family: "Inter",
  fonts: [
    {
      src: "/fonts/Inter/Inter-Regular.ttf",
      fontWeight: 400,
    },
    {
      src: "/fonts/Inter/Inter-Medium.ttf",
      fontWeight: 500,
    },
    {
      src: "/fonts/Inter/Inter-SemiBold.ttf",
      fontWeight: 600,
    },
    {
      src: "/fonts/Inter/Inter-Bold.ttf",
      fontWeight: 700,
    },
  ],
});

// Register Space Grotesk font
Font.register({
  family: "SpaceGrotesk",
  src: "/fonts/Space/SpaceGrotesk-SemiBold.ttf",
  fontWeight: 600,
});

// Create styles
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: "Inter",
    backgroundColor: "#fff",
  },
  header: {
    marginBottom: 20,
    fontFamily: "Inter",
    fontWeight: 400,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  courseName: {
    fontSize: 10,
    color: "#999",
    fontWeight: 600,
  },
  downloadDate: {
    fontSize: 10,
    color: "#999",
  },
  content: {
    flex: 1,
    fontSize: 12,
    lineHeight: 1.5,
    color: "#333",
    fontFamily: "Inter",
    fontWeight: 400,
  },
  footer: {
    marginTop: 20,
    color: "#999",
    fontFamily: "Inter",
    fontWeight: 400,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 10,
  },
  footerBranding: {
    fontSize: 10,
    fontFamily: "SpaceGrotesk",
    fontWeight: 600,
  },
  heading1: {
    fontSize: 24,
    marginBottom: 16,
    marginTop: 32,
    fontFamily: "Inter",
    fontWeight: 600,
    color: "#111",
  },
  heading2: {
    fontSize: 20,
    marginBottom: 14,
    marginTop: 28,
    fontFamily: "Inter",
    fontWeight: 600,
    color: "#222",
  },
  heading3: {
    fontSize: 16,
    marginBottom: 12,
    marginTop: 24,
    fontFamily: "Inter",
    fontWeight: 600,
    color: "#333",
  },
  paragraph: {
    marginBottom: 12,
    fontFamily: "Inter",
    fontWeight: 400,
  },
  bold: {
    fontFamily: "Inter",
    fontWeight: 600,
  },
  list: {
    marginBottom: 12,
    marginTop: 8,
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 8,
  },
  bullet: {
    width: 15,
    marginRight: 5,
    fontFamily: "Inter",
    fontWeight: 400,
  },
  listContent: {
    flex: 1,
    fontFamily: "Inter",
    fontWeight: 400,
  },
  math: {
    marginVertical: 8,
    padding: "4 8",
    backgroundColor: "#f8f9fa",
    borderRadius: 4,
    fontFamily: "Inter",
    fontSize: 12,
    color: "#333",
  },
  inlineMath: {
    padding: "0 2",
    backgroundColor: "#f8f9fa",
    borderRadius: 2,
    fontFamily: "Inter",
    fontSize: 12,
    color: "#333",
  },
});

const extractLatexFromKatexHtml = (html) => {
  try {
    // Find the annotation tag with encoding="application/x-tex"
    const match = html.match(
      /encoding="application\/x-tex">(.*?)<\/annotation>/
    );
    if (match && match[1]) {
      return match[1];
    }

    // Fallback: try to find content between <math> tags
    const mathMatch = html.match(/<math.*?>(.*?)<\/math>/s);
    if (mathMatch && mathMatch[1]) {
      // Clean up the math content to get something close to LaTeX
      return mathMatch[1]
        .replace(/<[^>]+>/g, "") // Remove HTML tags
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();
    }

    return html; // Return original if no match found
  } catch (error) {
    console.error("Error extracting LaTeX from KaTeX HTML:", error);
    return html;
  }
};

const processMarkdownToComponents = async (markdown) => {
  console.log("Processing markdown:", { length: markdown.length });

  try {
    const processor = unified().use(remarkParse).use(remarkMath).use(remarkGfm);

    const renderMath = (content, displayMode = false) => {
      try {
        // Check if content is KaTeX HTML
        if (content.includes('<span class="katex"')) {
          content = extractLatexFromKatexHtml(content);
        }

        return katex.renderToString(content, {
          displayMode,
          output: "text",
          throwOnError: false,
        });
      } catch (error) {
        console.error("Error rendering LaTeX:", error);
        return content;
      }
    };

    const renderNode = (node, index) => {
      let HeadingStyle;

      switch (node.type) {
        case "heading":
          HeadingStyle = styles[`heading${node.depth}`];
          return (
            <View key={index} style={HeadingStyle}>
              <Text>
                {node.children
                  .map((child) => {
                    // Check if child value contains KaTeX HTML
                    if (
                      child.value &&
                      child.value.includes('<span class="katex"')
                    ) {
                      return renderMath(child.value, false);
                    }
                    return child.value;
                  })
                  .join("")}
              </Text>
            </View>
          );

        case "paragraph":
          return (
            <View key={index} style={styles.paragraph}>
              <Text>
                {node.children.map((child, i) => {
                  if (child.type === "text") {
                    // Check if text contains KaTeX HTML
                    if (
                      child.value &&
                      child.value.includes('<span class="katex"')
                    ) {
                      return renderMath(child.value, false);
                    }
                    return child.value;
                  }
                  if (child.type === "strong") {
                    return (
                      <Text key={i} style={styles.bold}>
                        {child.children
                          .map((c) => {
                            // Check if strong text contains KaTeX HTML
                            if (
                              c.value &&
                              c.value.includes('<span class="katex"')
                            ) {
                              return renderMath(c.value, false);
                            }
                            return c.value;
                          })
                          .join("")}
                      </Text>
                    );
                  }
                  if (child.type === "inlineMath") {
                    return (
                      <Text key={i} style={styles.inlineMath}>
                        {renderMath(child.value, false)}
                      </Text>
                    );
                  }
                  if (child.type === "html") {
                    // Handle direct HTML nodes that might contain KaTeX
                    if (
                      child.value &&
                      child.value.includes('<span class="katex"')
                    ) {
                      return renderMath(child.value, false);
                    }
                    return child.value;
                  }
                  return "";
                })}
              </Text>
            </View>
          );

        case "list":
          return (
            <View key={index} style={styles.list}>
              {node.children.map((item, i) => (
                <View key={i} style={styles.listItem}>
                  <Text style={styles.bullet}>
                    {node.ordered ? `${i + 1}.` : "•"}
                  </Text>
                  <View style={styles.listContent}>
                    <Text>
                      {item.children[0].children.map((child, j) => {
                        if (child.type === "text") {
                          return child.value;
                        }
                        if (child.type === "strong") {
                          return (
                            <Text key={j} style={styles.bold}>
                              {child.children.map((c) => c.value).join("")}
                            </Text>
                          );
                        }
                        if (child.type === "inlineMath") {
                          return (
                            <Text key={j} style={styles.inlineMath}>
                              {renderMath(child.value, false)}
                            </Text>
                          );
                        }
                        return "";
                      })}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          );

        case "math": {
          return (
            <View key={index} style={styles.math}>
              <Text>{renderMath(node.value, true)}</Text>
            </View>
          );
        }

        case "thematicBreak":
          return (
            <View
              key={index}
              style={{
                borderBottomWidth: 1,
                borderBottomColor: "#e5e5e5",
                marginVertical: 20,
              }}
            />
          );

        default:
          console.log("Unhandled node type:", node.type);
          return null;
      }
    };

    const ast = await processor.parse(markdown);
    return ast.children.map(renderNode);
  } catch (error) {
    console.error("Error processing markdown:", error);
    throw error;
  }
};

const LectureTranscriptPdfGenerator = ({
  markdown,
  fileName,
  storagePath,
  onComplete,
  onError,
  courseName,
}) => {
  console.log("[Debug-PDF] Component mounted", {
    hasMarkdown: !!markdown,
    hasStoragePath: !!storagePath,
    fileName,
    courseName,
  });

  useEffect(() => {
    console.log("[Debug-PDF] Effect triggered");
    let isActive = true;

    const generatePDF = async () => {
      try {
        console.log("[Debug-PDF] Starting PDF generation");

        // Get markdown content either from props or storage
        let markdownContent = markdown;
        if (!markdownContent && storagePath) {
          console.log("[Debug-PDF] Fetching markdown from storage");
          const storageRef = ref(storage, storagePath);
          const url = await getDownloadURL(storageRef);
          const response = await fetch(url);
          markdownContent = await response.text();
        }

        if (!markdownContent) {
          throw new Error("No markdown content available");
        }

        const components = await processMarkdownToComponents(markdownContent);

        if (!isActive) {
          console.log(
            "[Debug-PDF] Component unmounted during generation, aborting"
          );
          return;
        }

        console.log("[Debug-PDF] Creating document component");
        const MyDocument = () => (
          <Document>
            <Page size="A4" style={styles.page}>
              <View style={styles.header} fixed>
                <View style={styles.headerContent}>
                  <Text style={styles.courseName}>
                    {courseName || "Untitled Course"}
                  </Text>
                  <Text style={styles.downloadDate}>
                    Downloaded on {new Date().toLocaleDateString()}
                  </Text>
                </View>
              </View>
              <View style={styles.content}>{components}</View>
              <View style={styles.footer} fixed>
                <Text style={styles.footerText}>
                  Built with <Text style={styles.footerBranding}>Chiara</Text>
                </Text>
                <Text
                  style={styles.footerText}
                  render={({ pageNumber, totalPages }) =>
                    `${pageNumber}/${totalPages}`
                  }
                />
              </View>
            </Page>
          </Document>
        );

        console.log("[Debug-PDF] Generating PDF blob");
        const blob = await pdf(<MyDocument />).toBlob();

        if (!isActive) {
          console.log(
            "[Debug-PDF] Component unmounted during blob generation, aborting"
          );
          return;
        }

        console.log("[Debug-PDF] Creating download link");
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${fileName}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        if (isActive) {
          console.log("[Debug-PDF] Download completed, calling onComplete");
          onComplete();
        }
      } catch (error) {
        console.error("[Debug-PDF] Generation failed:", error);
        if (isActive) {
          onError(error);
        }
      }
    };

    generatePDF();

    return () => {
      console.log("[Debug-PDF] Component cleanup");
      isActive = false;
    };
  }, [markdown, storagePath, fileName, onComplete, onError, courseName]);

  return null;
};

LectureTranscriptPdfGenerator.propTypes = {
  markdown: PropTypes.string,
  fileName: PropTypes.string.isRequired,
  storagePath: PropTypes.string,
  onComplete: PropTypes.func.isRequired,
  onError: PropTypes.func.isRequired,
  courseName: PropTypes.string,
};

export default LectureTranscriptPdfGenerator;
