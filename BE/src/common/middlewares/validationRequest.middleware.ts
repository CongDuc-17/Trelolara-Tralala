import type { RequestHandler } from 'express';
import { ZodError, type ZodType } from 'zod';

import { OptionalException } from '../exceptions';

export type ZodValidationSchema = {
	body?: ZodType;
	params?: ZodType;
	query?: ZodType;
	cookies?: ZodType;
	headers?: ZodType | ZodType[];
};

export const validateRequestMiddleware = (schema: ZodValidationSchema): RequestHandler => {
	return (req, res, next) => {
		try {
			const validated: Record<string, unknown> = {};
			for (const [key, validators] of Object.entries(schema)) {
				if (!validators) continue;
				let value: unknown = req[key as keyof ZodValidationSchema];
				for (const validator of Array.isArray(validators) ? validators : [validators]) {
					value = validator.parse(value);
				}
				validated[key] = value;
				// Express 5 query is a getter; expose parsed input to legacy controllers.
				Object.defineProperty(req, key, { value, writable: true, configurable: true, enumerable: true });
			}
			res.locals.validated = { ...res.locals.validated, ...validated };
			next();
		} catch (error) {
			if (error instanceof ZodError) {
				const message = error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ');
				return next(new OptionalException(422, message));
			}
			next(error);
		}
	};
};
