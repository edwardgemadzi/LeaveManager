import Joi from 'joi';

// Common validation schemas
export const schemas = {
  // User registration schemas
  registerLeader: Joi.object({
    username: Joi.string()
      .alphanum()
      .min(3)
      .max(30)
      .required()
      .messages({
        'string.alphanum': 'Username must contain only letters and numbers',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username must be no more than 30 characters long',
        'any.required': 'Username is required'
      }),
    fullName: Joi.string()
      .min(2)
      .max(100)
      .pattern(/^[a-zA-Z\s'-]+$/)
      .required()
      .messages({
        'string.min': 'Full name must be at least 2 characters long',
        'string.max': 'Full name must be no more than 100 characters long',
        'string.pattern.base': 'Full name can only contain letters, spaces, hyphens, and apostrophes',
        'any.required': 'Full name is required'
      }),
    password: Joi.string()
      .min(8)
      .max(128)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters long',
        'string.max': 'Password must be no more than 128 characters long',
        'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
        'any.required': 'Password is required'
      }),
    teamName: Joi.string()
      .min(2)
      .max(50)
      .pattern(/^[a-zA-Z0-9\s'-]+$/)
      .required()
      .messages({
        'string.min': 'Team name must be at least 2 characters long',
        'string.max': 'Team name must be no more than 50 characters long',
        'string.pattern.base': 'Team name can only contain letters, numbers, spaces, hyphens, and apostrophes',
        'any.required': 'Team name is required'
      }),
    teamUsername: Joi.string()
      .alphanum()
      .min(3)
      .max(30)
      .required()
      .messages({
        'string.alphanum': 'Team username must contain only letters and numbers',
        'string.min': 'Team username must be at least 3 characters long',
        'string.max': 'Team username must be no more than 30 characters long',
        'any.required': 'Team username is required'
      })
  }),

  registerMember: Joi.object({
    username: Joi.string()
      .alphanum()
      .min(3)
      .max(30)
      .required()
      .messages({
        'string.alphanum': 'Username must contain only letters and numbers',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username must be no more than 30 characters long',
        'any.required': 'Username is required'
      }),
    fullName: Joi.string()
      .min(2)
      .max(100)
      .pattern(/^[a-zA-Z\s'-]+$/)
      .required()
      .messages({
        'string.min': 'Full name must be at least 2 characters long',
        'string.max': 'Full name must be no more than 100 characters long',
        'string.pattern.base': 'Full name can only contain letters, spaces, hyphens, and apostrophes',
        'any.required': 'Full name is required'
      }),
    password: Joi.string()
      .min(8)
      .max(128)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters long',
        'string.max': 'Password must be no more than 128 characters long',
        'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
        'any.required': 'Password is required'
      }),
    teamUsername: Joi.string()
      .alphanum()
      .min(3)
      .max(30)
      .required()
      .messages({
        'string.alphanum': 'Team username must contain only letters and numbers',
        'string.min': 'Team username must be at least 3 characters long',
        'string.max': 'Team username must be no more than 30 characters long',
        'any.required': 'Team username is required'
      }),
    shiftSchedule: Joi.object({
      pattern: Joi.array()
        .items(Joi.boolean())
        .min(1)
        .max(14)
        .required()
        .messages({
          'array.min': 'Shift pattern must have at least 1 day',
          'array.max': 'Shift pattern cannot exceed 14 days',
          'any.required': 'Shift pattern is required'
        }),
      startDate: Joi.date()
        .required()
        .messages({
          'date.base': 'Start date must be a valid date',
          'any.required': 'Start date is required'
        }),
      type: Joi.string()
        .valid('rotating', 'fixed')
        .required()
        .messages({
          'any.only': 'Shift type must be either "rotating" or "fixed"',
          'any.required': 'Shift type is required'
        })
    }).required()
  }),

  // Login schema
  login: Joi.object({
    username: Joi.string()
      .alphanum()
      .min(3)
      .max(30)
      .required()
      .messages({
        'string.alphanum': 'Username must contain only letters and numbers',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username must be no more than 30 characters long',
        'any.required': 'Username is required'
      }),
    password: Joi.string()
      .min(1)
      .max(128)
      .required()
      .messages({
        'string.min': 'Password is required',
        'string.max': 'Password is too long',
        'any.required': 'Password is required'
      })
  }),

  // Leave request schema
  leaveRequest: Joi.object({
    startDate: Joi.date()
      .min('now')
      .required()
      .messages({
        'date.min': 'Start date must be in the future',
        'date.base': 'Start date must be a valid date',
        'any.required': 'Start date is required'
      }),
    endDate: Joi.date()
      .min(Joi.ref('startDate'))
      .required()
      .messages({
        'date.min': 'End date must be after start date',
        'date.base': 'End date must be a valid date',
        'any.required': 'End date is required'
      }),
    reason: Joi.string()
      .min(3)
      .max(500)
      .required()
      .messages({
        'string.min': 'Reason must be at least 3 characters long',
        'string.max': 'Reason must be no more than 500 characters long',
        'any.required': 'Reason is required'
      })
  }),

  // Emergency request schema
  emergencyRequest: Joi.object({
    memberId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'Invalid member ID format',
        'any.required': 'Member ID is required'
      }),
    startDate: Joi.date()
      .required()
      .messages({
        'date.base': 'Start date must be a valid date',
        'any.required': 'Start date is required'
      }),
    endDate: Joi.date()
      .min(Joi.ref('startDate'))
      .required()
      .messages({
        'date.min': 'End date must be after start date',
        'date.base': 'End date must be a valid date',
        'any.required': 'End date is required'
      }),
    reason: Joi.string()
      .valid('Medical Emergency', 'Family Emergency', 'Personal Crisis', 'Other Emergency')
      .required()
      .messages({
        'any.only': 'Invalid emergency reason',
        'any.required': 'Emergency reason is required'
      }),
    password: Joi.string()
      .min(1)
      .max(128)
      .required()
      .messages({
        'string.min': 'Password is required',
        'string.max': 'Password is too long',
        'any.required': 'Password is required'
      }),
    isEmergency: Joi.boolean()
      .valid(true)
      .required()
      .messages({
        'any.only': 'This endpoint is for emergency requests only',
        'any.required': 'Emergency flag is required'
      })
  }),

  // Password change schema
  changePassword: Joi.object({
    currentPassword: Joi.string()
      .min(1)
      .max(128)
      .required()
      .messages({
        'string.min': 'Current password is required',
        'string.max': 'Current password is too long',
        'any.required': 'Current password is required'
      }),
    newPassword: Joi.string()
      .min(8)
      .max(128)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required()
      .messages({
        'string.min': 'New password must be at least 8 characters long',
        'string.max': 'New password must be no more than 128 characters long',
        'string.pattern.base': 'New password must contain at least one lowercase letter, one uppercase letter, one number, and one special character',
        'any.required': 'New password is required'
      }),
    confirmPassword: Joi.string()
      .valid(Joi.ref('newPassword'))
      .required()
      .messages({
        'any.only': 'Password confirmation does not match',
        'any.required': 'Password confirmation is required'
      })
  }),

  // Profile update schema
  updateProfile: Joi.object({
    fullName: Joi.string()
      .min(2)
      .max(100)
      .pattern(/^[a-zA-Z\s'-]+$/)
      .required()
      .messages({
        'string.min': 'Full name must be at least 2 characters long',
        'string.max': 'Full name must be no more than 100 characters long',
        'string.pattern.base': 'Full name can only contain letters, spaces, hyphens, and apostrophes',
        'any.required': 'Full name is required'
      })
  }),

  // Team settings schema
  teamSettings: Joi.object({
    concurrentLeave: Joi.number()
      .integer()
      .min(1)
      .max(10)
      .required()
      .messages({
        'number.base': 'Concurrent leave must be a number',
        'number.integer': 'Concurrent leave must be a whole number',
        'number.min': 'Concurrent leave must be at least 1',
        'number.max': 'Concurrent leave cannot exceed 10',
        'any.required': 'Concurrent leave is required'
      }),
    maxLeavePerYear: Joi.number()
      .integer()
      .min(1)
      .max(365)
      .required()
      .messages({
        'number.base': 'Max leave per year must be a number',
        'number.integer': 'Max leave per year must be a whole number',
        'number.min': 'Max leave per year must be at least 1',
        'number.max': 'Max leave per year cannot exceed 365',
        'any.required': 'Max leave per year is required'
      }),
    minimumNoticePeriod: Joi.number()
      .integer()
      .min(0)
      .max(30)
      .required()
      .messages({
        'number.base': 'Minimum notice period must be a number',
        'number.integer': 'Minimum notice period must be a whole number',
        'number.min': 'Minimum notice period cannot be negative',
        'number.max': 'Minimum notice period cannot exceed 30 days',
        'any.required': 'Minimum notice period is required'
      })
  })
};

// Validation helper function
export function validateRequest(schema: Joi.ObjectSchema, data: unknown) {
  const { error, value } = schema.validate(data, { abortEarly: false });
  
  if (error) {
    const errorMessages = error.details.map(detail => detail.message);
    return {
      isValid: false,
      errors: errorMessages,
      data: null
    };
  }
  
  return {
    isValid: true,
    errors: [],
    data: value
  };
}
