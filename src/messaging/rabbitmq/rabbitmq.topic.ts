export enum RabbitMQTopics {
    // Booking events
    CREATE_USER = 'create.user',
    RESEND_VERIFICATION_CODE = 'resend.verification.code',
    
    // Building events
    CREATE_NOTIFICATION = 'create.notification',
    SEND_NOTIFICATION = 'send.notification',
    SEND_NOTIFICATION_TO_USER = 'send.notification.to.user',
    SEND_NOTIFICATION_TO_ALL = 'send.notification.to.all',
    SEND_NOTIFICATION_TO_ADMIN = 'send.notification.to.admin',
    SEND_NOTIFICATION_TO_STAFF = 'send.notification.to.staff',
  }
  