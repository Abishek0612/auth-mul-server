import User from "../models/user.model";
import { NotFoundError } from "../utils/api-errors";

export default class UserService {
  static async getUserById(userId: string) {
    const user = await User.findById(userId)
      .select("-password")
      .populate("organization", "name code");
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return user;
  }

  static async updateUserProfile(
    userId: string,
    updateData: { firstName?: string; lastName?: string; mobile?: string }
  ) {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .select("-password")
      .populate("organization", "name code");

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  }

  static async getUsersByOrganization(organizationId: string) {
    return User.find({ organization: organizationId })
      .select("-password")
      .populate("organization", "name code")
      .sort({ createdAt: -1 });
  }

  static async changeUserRole(userId: string, role: string) {
    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true, runValidators: true }
    )
      .select("-password")
      .populate("organization", "name code");

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  }

  static async toggleUserStatus(userId: string, isActive: boolean) {
    const user = await User.findByIdAndUpdate(
      userId,
      { isVerified: isActive },
      { new: true }
    )
      .select("-password")
      .populate("organization", "name code");

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  }
}
