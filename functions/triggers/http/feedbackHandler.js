/* global process */

import { onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import * as dotenv from "dotenv";
import formData from "form-data"; // Required by mailgun.js
import Mailgun from "mailgun.js";

// Load environment variables from .env file if present (mainly for local development)
dotenv.config();

// --- Mailgun Configuration ---
const mailgunApiKey = process.env.MAILGUN_API_KEY;
const mailgunDomain = process.env.MAILGUN_DOMAIN;
const senderEmail =
  process.env.MAILGUN_SENDER_EMAIL ||
  (mailgunDomain ? `feedback@${mailgunDomain}` : undefined);
const recipientEmail = "chiara@cver.me"; // Recipient email address

let mg;
if (mailgunApiKey) {
  try {
    const mailgun = new Mailgun(formData);
    mg = mailgun.client({
      username: "api",
      key: mailgunApiKey,
    });
  } catch (error) {
    logger.error("Failed to initialize Mailgun client:", error);
    mg = null; // Ensure mg is null if initialization fails
  }
} else {
  logger.warn(
    "MAILGUN_API_KEY not found in environment variables. Mailgun client not initialized."
  );
  mg = null;
}

if (!mailgunDomain) {
  logger.warn("MAILGUN_DOMAIN not found in environment variables.");
}
if (!senderEmail) {
  logger.warn(
    "Could not determine senderEmail (MAILGUN_SENDER_EMAIL or MAILGUN_DOMAIN missing)."
  );
}

// --- Callable Function ---
export const sendFeedbackEmail = onCall(
  { enforceAppCheck: true, cors: true }, // Ensure authentication
  async (request) => {
    const { message, feedbackType, userId, userEmail, userAgent, pageUrl } =
      request.data;
    const auth = request.auth;

    // Require authentication
    if (!auth) {
      throw new Error("Authentication required");
    }

    // Check if Mailgun is configured
    if (!mg || !mailgunDomain || !senderEmail) {
      logger.error("Mailgun is not properly configured. Cannot send email.");
      return {
        success: false,
        error: "Email service configuration error.",
      };
    }

    try {
      logger.info("Received feedback request:", { data: request.data }); // Log request data

      // --- Data Validation ---
      if (!message || typeof message !== "string" || message.trim() === "") {
        logger.error("Validation failed: Missing or invalid 'message'.", {
          data: request.data,
        });
        return {
          success: false,
          error: "Message is required and cannot be empty.",
        };
      }

      // --- Construct Email ---
      // Use authenticated user's ID and email if not explicitly provided
      const userIdToUse = userId || auth.uid;
      const userEmailToUse = userEmail || auth.token.email || null;

      // Determine feedback type for the subject
      const feedbackTypeText = feedbackType
        ? {
            general: "General Feedback",
            bug: "Bug Report",
            idea: "Feature Idea",
          }[feedbackType] || "Feedback"
        : "Feedback";

      const subject = `New ${feedbackTypeText} from ${userEmailToUse || userIdToUse}`;
      // Basic sanitization or formatting can be added here if needed
      const cleanMessage = message.trim();

      const textBody = `
${feedbackTypeText}:
-----------------
${cleanMessage}
-----------------

User Info:
----------
User ID: ${userIdToUse}
User Email: ${userEmailToUse || "Not provided"}
User Agent: ${userAgent || "Not provided"}
Page URL: ${pageUrl || "Not provided"}
      `;

      const htmlBody = `
<h2>${feedbackTypeText}:</h2>
<p>${cleanMessage.replace(/\n/g, "<br>")}</p>
<hr>
<h2>User Info:</h2>
<ul>
  <li><strong>User ID:</strong> ${userIdToUse}</li>
  <li><strong>User Email:</strong> ${userEmailToUse || "Not provided"}</li>
  <li><strong>User Agent:</strong> ${userAgent || "Not provided"}</li>
  <li><strong>Page URL:</strong> ${pageUrl || "Not provided"}</li>
</ul>
      `;

      const emailData = {
        from: senderEmail,
        to: [recipientEmail], // Mailgun expects an array
        subject: subject,
        text: textBody,
        html: htmlBody,
        // Add Reply-To header if user email is available
        ...(userEmailToUse ? { "h:Reply-To": userEmailToUse } : {}),
      };

      logger.info("Attempting to send email via Mailgun...", {
        from: senderEmail,
        to: recipientEmail, // Log single recipient for clarity
        subject: subject,
        domain: mailgunDomain,
      });

      // --- Send Email ---
      const result = await mg.messages.create(mailgunDomain, emailData);

      logger.info("Mailgun send result:", {
        status: result.status,
        message: result.message,
      }); // Log Mailgun API response summary

      // --- Return Result ---
      return {
        success: true,
        message: "Feedback sent successfully.",
      };
    } catch (error) {
      logger.error("Error processing sendFeedbackEmail request:", error);

      let clientErrorMessage =
        "Failed to send feedback email due to an internal error.";

      // Log specific Mailgun errors if available
      if (error.status) {
        logger.error("Mailgun API error details:", {
          status: error.status,
          details: error.details,
        });
        // Potentially customize client message based on Mailgun status
        if (error.status === 400) {
          clientErrorMessage =
            "Failed to send feedback: Invalid request data provided to email service.";
        } else if (error.status === 401) {
          clientErrorMessage =
            "Failed to send feedback: Email service authentication error.";
        } else if (error.status === 404) {
          clientErrorMessage =
            "Failed to send feedback: Email service endpoint not found.";
        }
      }

      // For callable functions, throwing an error will send the error to the client
      return {
        success: false,
        error: clientErrorMessage,
      };
    }
  }
);
