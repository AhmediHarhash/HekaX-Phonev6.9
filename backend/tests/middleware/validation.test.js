// ============================================================================
// HEKAX Phone - Validation Middleware Tests
// ============================================================================

const {
  patterns,
  authSchemas,
  teamSchemas,
  leadSchemas,
  validateBody,
  validateQuery,
  validateIdParam,
  Joi,
} = require('../../middleware/validation.middleware');

describe('Validation Middleware', () => {
  describe('Pattern Validators', () => {
    describe('Email Pattern', () => {
      it('should accept valid emails', () => {
        const { error } = patterns.email.validate('test@example.com');
        expect(error).toBeUndefined();
      });

      it('should reject invalid emails', () => {
        const { error } = patterns.email.validate('not-an-email');
        expect(error).toBeDefined();
      });

      it('should normalize email to lowercase', () => {
        const { value } = patterns.email.validate('TEST@EXAMPLE.COM');
        expect(value).toBe('test@example.com');
      });
    });

    describe('Phone Pattern', () => {
      it('should accept E.164 format', () => {
        const { error } = patterns.phone.validate('+14155551234');
        expect(error).toBeUndefined();
      });

      it('should reject invalid phone numbers', () => {
        const { error } = patterns.phone.validate('555-1234');
        expect(error).toBeDefined();
      });
    });

    describe('Password Pattern', () => {
      it('should accept valid passwords', () => {
        const { error } = patterns.password.validate('SecurePass123');
        expect(error).toBeUndefined();
      });

      it('should reject passwords without uppercase', () => {
        const { error } = patterns.password.validate('lowercase123');
        expect(error).toBeDefined();
      });

      it('should reject passwords without numbers', () => {
        const { error } = patterns.password.validate('NoNumbersHere');
        expect(error).toBeDefined();
      });

      it('should reject short passwords', () => {
        const { error } = patterns.password.validate('Ab1');
        expect(error).toBeDefined();
      });
    });

    describe('Color Pattern', () => {
      it('should accept valid hex colors', () => {
        const { error } = patterns.color.validate('#FF5733');
        expect(error).toBeUndefined();
      });

      it('should reject invalid colors', () => {
        const { error } = patterns.color.validate('red');
        expect(error).toBeDefined();
      });
    });

    describe('URL Pattern', () => {
      it('should accept valid URLs', () => {
        const { error } = patterns.url.validate('https://example.com/path');
        expect(error).toBeUndefined();
      });

      it('should reject non-HTTP URLs', () => {
        const { error } = patterns.url.validate('ftp://example.com');
        expect(error).toBeDefined();
      });
    });
  });

  describe('Auth Schemas', () => {
    describe('Register Schema', () => {
      it('should accept valid registration data', () => {
        const { error } = authSchemas.register.validate({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
          orgName: 'Test Company',
        });
        expect(error).toBeUndefined();
      });

      it('should require email', () => {
        const { error } = authSchemas.register.validate({
          password: 'password123',
          name: 'Test User',
          orgName: 'Test Company',
        });
        expect(error).toBeDefined();
      });

      it('should require either orgName or organizationName', () => {
        const { error } = authSchemas.register.validate({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        });
        expect(error).toBeDefined();
      });
    });

    describe('Login Schema', () => {
      it('should accept valid login data', () => {
        const { error } = authSchemas.login.validate({
          email: 'test@example.com',
          password: 'password123',
        });
        expect(error).toBeUndefined();
      });

      it('should require both email and password', () => {
        const { error: err1 } = authSchemas.login.validate({ email: 'test@example.com' });
        const { error: err2 } = authSchemas.login.validate({ password: 'password' });
        expect(err1).toBeDefined();
        expect(err2).toBeDefined();
      });
    });
  });

  describe('Team Schemas', () => {
    describe('Invite Schema', () => {
      it('should accept valid invite data', () => {
        const { error, value } = teamSchemas.invite.validate({
          email: 'new@example.com',
          name: 'New Member',
        });
        expect(error).toBeUndefined();
        expect(value.role).toBe('AGENT'); // default
      });

      it('should validate role options', () => {
        const { error } = teamSchemas.invite.validate({
          email: 'new@example.com',
          name: 'New Member',
          role: 'INVALID_ROLE',
        });
        expect(error).toBeDefined();
      });
    });
  });

  describe('Lead Schemas', () => {
    describe('Update Schema', () => {
      it('should accept valid status values', () => {
        const validStatuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST'];
        validStatuses.forEach(status => {
          const { error } = leadSchemas.update.validate({ status });
          expect(error).toBeUndefined();
        });
      });

      it('should reject invalid status values', () => {
        const { error } = leadSchemas.update.validate({ status: 'INVALID' });
        expect(error).toBeDefined();
      });
    });

    describe('Query Schema', () => {
      it('should apply default limit', () => {
        const { value } = leadSchemas.query.validate({});
        expect(value.limit).toBe(50);
      });

      it('should enforce max limit', () => {
        const { error } = leadSchemas.query.validate({ limit: 1000 });
        expect(error).toBeDefined();
      });
    });
  });

  describe('Middleware Functions', () => {
    describe('validateBody', () => {
      it('should pass valid data', () => {
        const middleware = validateBody(authSchemas.login);
        const req = { body: { email: 'test@example.com', password: 'pass' } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });

      it('should reject invalid data with 400', () => {
        const middleware = validateBody(authSchemas.login);
        const req = { body: { email: 'invalid' } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
      });

      it('should strip unknown fields', () => {
        const middleware = validateBody(authSchemas.login);
        const req = { body: { email: 'test@example.com', password: 'pass', unknown: 'field' } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        middleware(req, res, next);

        expect(req.body.unknown).toBeUndefined();
      });
    });

    describe('validateIdParam', () => {
      it('should accept valid UUIDs', () => {
        const req = { params: { id: '550e8400-e29b-41d4-a716-446655440000' } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        validateIdParam(req, res, next);

        expect(next).toHaveBeenCalled();
      });

      it('should reject invalid UUIDs', () => {
        const req = { params: { id: 'not-a-uuid' } };
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        const next = jest.fn();

        validateIdParam(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
      });
    });
  });
});
