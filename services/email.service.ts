// src/services/email.service.ts
import nodemailer from 'nodemailer';
import crypto from 'crypto';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

class EmailService {
  private transporter: nodemailer.Transporter;
  private isUsingFallback: boolean = false;

  constructor() {
    this.transporter = this.createTransporter();
    this.verifyConnection();
  }

  private createTransporter(): nodemailer.Transporter {
    const emailUser = process.env.EMAIL_USER;
    const emailPassword = process.env.EMAIL_PASSWORD;

    console.log(' Email Configuration:');
    console.log('- User:', emailUser || 'Not configured');
    console.log('- Password:', emailPassword ? '***' + emailPassword.slice(-4) : 'Not configured');

    // Jika tidak ada konfigurasi email, gunakan fallback
    if (!emailUser || !emailPassword) {
      console.warn('  Email not configured. Using console fallback.');
      this.isUsingFallback = true;
      return this.createConsoleFallback();
    }

    // Konfigurasi untuk Gmail
    const config = {
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPassword,
      },
      debug: true,
      logger: true
    };

    console.log('- Provider: Gmail (smtp.gmail.com)');
    this.isUsingFallback = false;
    
    return nodemailer.createTransport(config);
  }

  private createConsoleFallback(): nodemailer.Transporter {
    this.isUsingFallback = true;
    return nodemailer.createTransport({
      jsonTransport: true
    });
  }

  private async verifyConnection() {
    try {
      await this.transporter.verify();
      console.log(' Email service ready\n');
    } catch (error: any) {
      console.error(' Email verification failed:', error.message);
      console.log(' Email will be logged to console instead\n');
      this.transporter = this.createConsoleFallback();
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const fromEmail = process.env.EMAIL_USER || 'noreply@inventory.com';
      
      const mailOptions = {
        from: `"${process.env.APP_NAME || 'Inventory System'}" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
      };

      console.log(' Attempting to send email to:', options.to);

      const info = await this.transporter.sendMail(mailOptions);

      // Jika menggunakan fallback, log ke console
      if (this.isUsingFallback) {
        console.log('\n ========== EMAIL WOULD BE SENT ==========');
        console.log('To:', options.to);
        console.log('Subject:', options.subject);
        console.log('HTML Content Length:', options.html.length);
        console.log('==========================================\n');
        return true;
      }

      // Email berhasil dikirim
      console.log(' Email sent successfully to:', options.to);
      console.log(' Message ID:', info.messageId);
      console.log(' Response:', info.response);
      
      return true;
    } catch (error: any) {
      console.error(' Error sending email:', error.message);
      
      // Log detail error untuk debugging
      console.log('\n ========== EMAIL FAILED TO SEND ==========');
      console.log('To:', options.to);
      console.log('Subject:', options.subject);
      console.log('Error Details:', error);
      
      if (error.code) {
        console.log('Error Code:', error.code);
      }
      if (error.command) {
        console.log('Failed Command:', error.command);
      }
      
      console.log('============================================\n');
      
      return false;
    }
  }

  generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async sendVerificationEmail(email: string, name: string, token: string): Promise<boolean> {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
    
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
          }
          .container { 
            background-color: #f4f4f4; 
            border-radius: 10px; 
            padding: 30px; 
          }
          .header { 
            background-color: #4CAF50; 
            color: white; 
            padding: 20px; 
            text-align: center; 
            border-radius: 10px 10px 0 0; 
            margin: -30px -30px 30px -30px; 
          }
          .button { 
            display: inline-block; 
            padding: 12px 30px; 
            background-color: #4CAF50; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0; 
          }
          .footer { 
            margin-top: 30px; 
            text-align: center; 
            font-size: 12px; 
            color: #666; 
          }
          .warning { 
            background-color: #fff3cd; 
            border-left: 4px solid #ffc107; 
            padding: 15px; 
            margin: 20px 0; 
          }
          .token-box { 
            background-color: #f9f9f9; 
            padding: 15px; 
            border-radius: 5px; 
            margin: 15px 0; 
            font-family: monospace; 
            word-break: break-all; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Inventory System!</h1>
          </div>
          
          <h2>Hi ${name},</h2>
          
          <p>Thank you for registering with us. To complete your registration, please verify your email address by clicking the button below:</p>
          
          <center>
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
          </center>
          
          <p>Or copy and paste this link into your browser:</p>
          <div class="token-box">
            ${verificationUrl}
          </div>
          
          <div class="warning">
            <strong> Important:</strong> This verification link will expire in 24 hours.
          </div>
          
          <p>If you didn't create an account with us, please ignore this email.</p>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Inventory System. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: 'Verify Your Email Address - Inventory System',
      html,
    });
  }

  async sendWelcomeEmail(email: string, name: string): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
          }
          .container { 
            background-color: #f4f4f4; 
            border-radius: 10px; 
            padding: 30px; 
          }
          .header { 
            background-color: #2196F3; 
            color: white; 
            padding: 20px; 
            text-align: center; 
            border-radius: 10px 10px 0 0; 
            margin: -30px -30px 30px -30px; 
          }
          .button { 
            display: inline-block; 
            padding: 12px 30px; 
            background-color: #2196F3; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px; 
            margin: 20px 0; 
          }
          .footer { 
            margin-top: 30px; 
            text-align: center; 
            font-size: 12px; 
            color: #666; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Email Verified Successfully!</h1>
          </div>
          
          <h2>Welcome aboard, ${name}!</h2>
          
          <p>Your email has been verified and your account is now active.</p>
          
          <center>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" class="button">Go to Login</a>
          </center>
          
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Inventory System. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail({
      to: email,
      subject: 'Welcome to Inventory System!',
      html,
    });
  }
}

export default new EmailService();