import { createParamDecorator, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { Request } from 'express';

export const GetUser = createParamDecorator(
  (key: string, context: ExecutionContext) => {
    try {
      const request = context
        .switchToHttp()
        .getRequest<Request & { user: any }>();
      
      if (!request.user) {
        throw new InternalServerErrorException('User not found in request');
      }
      
      const user = request.user;
      
      // If requesting a specific key
      if (key) {
        // Handle special case for 'sub' - if not found, try to get 'id'
        if (key === 'sub' && !(key in user)) {
          console.log('Sub not found, using id instead');
          return user.id ? Number(user.id) : undefined;
        }
        
        if (key in user) {
          const value = user[key];
          // If the key is 'sub' (userId), ensure it's a valid number
          if (key === 'sub' && value) {
            return Number(value);
          }
          return value;
        } else {
          console.warn(`Key "${key}" not found in user object:`, user);
          // For debugging purposes
          console.log('Available user properties:', Object.keys(user));
          
          // Return undefined or a default value
          return undefined;
        }
      }
      
      return user;
    } catch (error) {
      console.error('Error in GetUser decorator:', error);
      throw error;
    }
  },
);
