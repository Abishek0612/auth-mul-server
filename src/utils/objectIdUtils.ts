import { Types } from "mongoose";

export const isValidObjectId = (id: any): boolean => {
  if (!id) return false;

  if (id instanceof Types.ObjectId) return true;

  const idString = String(id);

  if (!/^[0-9a-fA-F]{24}$/.test(idString)) return false;

  try {
    const objectId = new Types.ObjectId(idString);
    return objectId.toString() === idString;
  } catch (error) {
    return false;
  }
};

export const toObjectId = (id: any): Types.ObjectId => {
  if (!isValidObjectId(id)) {
    throw new Error(`Invalid ObjectId: ${id}`);
  }

  if (id instanceof Types.ObjectId) return id;
  return new Types.ObjectId(String(id));
};

export const extractObjectIdString = (obj: any): string => {
  if (!obj) return "";

  if (typeof obj === "string") return obj;
  if (obj instanceof Types.ObjectId) return obj.toString();
  if (obj._id) return extractObjectIdString(obj._id);

  return String(obj);
};
