export enum RabbitMQTopics {
  CREATE_USER = 'create.user',
  RESEND_VERIFICATION_CODE = 'resend.verification.code',
  /** Auth-service: user requested password reset — notification sends email with link */
  PASSWORD_RESET_REQUESTED = 'password.reset.requested',
  CREATE_NOTIFICATION = 'create.notification',
}

