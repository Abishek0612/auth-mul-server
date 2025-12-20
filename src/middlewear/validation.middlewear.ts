import { Request, Response, NextFunction } from "express";
import Joi from "joi";
import { BadRequestError } from "../utils/api-errors";

export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errorMessage = error.details
        .map((detail) => detail.message)
        .join(", ");

      return next(new BadRequestError(errorMessage));
    }

    next();
  };
};
