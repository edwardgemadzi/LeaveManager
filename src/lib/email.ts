// Email notification system
// Note: This is a placeholder implementation
// In production, you would integrate with services like SendGrid, AWS SES, or Nodemailer

export interface EmailNotification {
  to: string;
  subject: string;
  body: string;
  type: 'leave_approved' | 'leave_rejected' | 'leave_requested' | 'leave_reminder' | 'password_reset';
}

export class EmailService {
  private static instance: EmailService;
  
  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  async sendNotification(notification: EmailNotification): Promise<boolean> {
    try {
      // In a real implementation, you would:
      // 1. Validate email address
      // 2. Send email via your chosen service
      // 3. Log the email for audit purposes
      
      console.log('📧 Email notification:', {
        to: notification.to,
        subject: notification.subject,
        type: notification.type,
        timestamp: new Date().toISOString()
      });

      // Simulate email sending
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return true;
    } catch (error) {
      console.error('Failed to send email notification:', error);
      return false;
    }
  }

  async sendLeaveApprovalNotification(
    userEmail: string,
    userName: string,
    startDate: string,
    endDate: string,
    reason: string
  ): Promise<boolean> {
    const notification: EmailNotification = {
      to: userEmail,
      subject: '✅ Leave Request Approved',
      body: `
        Dear ${userName},
        
        Your leave request has been approved!
        
        Details:
        - Start Date: ${startDate}
        - End Date: ${endDate}
        - Reason: ${reason}
        
        Please ensure all your work is covered during this period.
        
        Best regards,
        Your Team
      `,
      type: 'leave_approved'
    };

    return this.sendNotification(notification);
  }

  async sendLeaveRejectionNotification(
    userEmail: string,
    userName: string,
    startDate: string,
    endDate: string,
    reason: string,
    rejectionReason?: string
  ): Promise<boolean> {
    const notification: EmailNotification = {
      to: userEmail,
      subject: '❌ Leave Request Rejected',
      body: `
        Dear ${userName},
        
        Unfortunately, your leave request has been rejected.
        
        Details:
        - Start Date: ${startDate}
        - End Date: ${endDate}
        - Reason: ${reason}
        ${rejectionReason ? `- Rejection Reason: ${rejectionReason}` : ''}
        
        Please contact your team leader for more information.
        
        Best regards,
        Your Team
      `,
      type: 'leave_rejected'
    };

    return this.sendNotification(notification);
  }

  async sendNewLeaveRequestNotification(
    leaderEmail: string,
    leaderName: string,
    memberName: string,
    startDate: string,
    endDate: string,
    reason: string
  ): Promise<boolean> {
    const notification: EmailNotification = {
      to: leaderEmail,
      subject: '📋 New Leave Request',
      body: `
        Dear ${leaderName},
        
        ${memberName} has submitted a new leave request that requires your approval.
        
        Details:
        - Member: ${memberName}
        - Start Date: ${startDate}
        - End Date: ${endDate}
        - Reason: ${reason}
        
        Please review and approve/reject this request in the Leave Manager system.
        
        Best regards,
        Leave Manager System
      `,
      type: 'leave_requested'
    };

    return this.sendNotification(notification);
  }

  async sendPasswordResetNotification(
    userEmail: string,
    userName: string,
    resetUrl: string
  ): Promise<boolean> {
    const notification: EmailNotification = {
      to: userEmail,
      subject: '🔐 Password Reset Request',
      body: `
        Dear ${userName},
        
        You have requested to reset your password for Leave Manager.
        
        Click the link below to reset your password:
        ${resetUrl}
        
        This link will expire in 15 minutes.
        
        If you did not request this password reset, please ignore this email.
        
        Best regards,
        Leave Manager Team
      `,
      type: 'password_reset'
    };

    return this.sendNotification(notification);
  }
}

export const emailService = EmailService.getInstance();
