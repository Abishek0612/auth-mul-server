import nodemailer from "nodemailer";
import logger from "./logger";
import { environment } from "./environment";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

class EmailService {
  private transporter: nodemailer.Transporter;
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== "production";

    this.transporter = nodemailer.createTransport({
      host: environment.smtpHost,
      port: environment.smtpPort,
      secure: environment.smtpSecure,
      auth: {
        user: environment.smtpUser,
        pass: environment.smtpPassword,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    this.verifyConnection();
  }

  /**
   * Verify SMTP connection on initialization
   */
  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      logger.info("SMTP server connection established successfully");
      logger.info(`Using email account: ${environment.smtpUser}`);
    } catch (error) {
      logger.error("SMTP connection verification failed:", error);
      logger.warn(
        "Email sending may not work. Check your Gmail settings and credentials."
      );

      if (!environment.smtpUser) {
        logger.error(
          "SMTP user (email address) is not set. Please update your environment configuration."
        );
      }

      if (!environment.smtpPassword) {
        logger.error(
          "SMTP password is not set. Please update your environment configuration."
        );
      }
    }
  }

  /**
   * Send an email
   */
  async sendEmail({ to, subject, html }: EmailOptions): Promise<void> {
    if (this.isDevelopment) {
      logger.info("=== EMAIL SENDING ATTEMPT (DEV MODE) ===");
      logger.info(`From: ${environment.smtpUser}`);
      logger.info(`To: ${to}`);
      logger.info(`Subject: ${subject}`);
      logger.info(
        `Using SMTP Server: ${environment.smtpHost}:${environment.smtpPort}`
      );
      logger.info("=== END EMAIL DETAILS ===");
    }

    try {
      const mailOptions = {
        from: `"Auth System" <${environment.smtpUser}>`,
        to,
        subject,
        html,
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent to ${to}, Message ID: ${info.messageId}`);

      if (this.isDevelopment) {
        logger.info(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);

        if (info.accepted.length > 0) {
          logger.info(`Email accepted by: ${info.accepted.join(", ")}`);
        }

        if (info.rejected.length > 0) {
          logger.warn(`Email rejected by: ${info.rejected.join(", ")}`);
        }
      }
    } catch (error) {
      logger.error("Error sending email:", error);

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Invalid login")) {
        logger.error(
          "Authentication failed: Check your Gmail username and password/App Password"
        );
        logger.error(
          "If using Gmail with 2FA, ensure you're using an App Password"
        );
      } else if (errorMessage.includes("Rate limit")) {
        logger.error(
          "Gmail rate limit exceeded. Try again later or consider a dedicated email service"
        );
      }
      throw new Error("Failed to send email");
    }
  }

  /**
   * Send verification email with OTP
   */
  async sendVerificationEmail(email: string, otp: string): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0284c7; text-align: center;">Verify Your Email</h2>
        <p>Thank you for registering with our service. To complete your registration, please use the following OTP code:</p>
        <div style="background-color: #f0f9ff; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
          <h1 style="color: #0284c7; margin: 0; letter-spacing: 5px;">${otp}</h1>
        </div>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
      </div>
    `;

    try {
      await this.sendEmail({
        to: email,
        subject: "Email Verification Code",
        html,
      });
    } catch (error) {
      if (this.isDevelopment) {
        logger.warn(
          "Email sending failed, but providing OTP for development testing"
        );
        logger.info(`==== DEVELOPMENT FALLBACK ====`);
        logger.info(`Verification OTP for ${email}: ${otp}`);
        logger.info(`=============================`);

        if (!this.isDevelopment) {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Send password reset email with OTP
   */
  async sendPasswordResetEmail(email: string, otp: string): Promise<void> {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0284c7; text-align: center;">Reset Your Password</h2>
        <p>We received a request to reset your password. Please use the following OTP code to reset your password:</p>
        <div style="background-color: #f0f9ff; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0;">
          <h1 style="color: #0284c7; margin: 0; letter-spacing: 5px;">${otp}</h1>
        </div>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
      </div>
    `;

    try {
      await this.sendEmail({
        to: email,
        subject: "Password Reset Code",
        html,
      });
    } catch (error) {
      if (this.isDevelopment) {
        logger.warn(
          "Email sending failed, but providing OTP for development testing"
        );
        logger.info(`==== DEVELOPMENT FALLBACK ====`);
        logger.info(`Password Reset OTP for ${email}: ${otp}`);
        logger.info(`=============================`);

        if (!this.isDevelopment) {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }
}

export default new EmailService();
