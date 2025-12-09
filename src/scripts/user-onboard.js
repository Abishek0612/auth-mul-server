require("dotenv").config();
const path = require("path");

const logger = {
  info: (message) => console.log(`[INFO] ${message}`),
  error: (message, error) => console.error(`[ERROR] ${message}`, error),
};

const distPath = path.resolve(__dirname, "../../dist");

const connectDB = require(path.join(distPath, "config/database")).default;
const Organization = require(path.join(
  distPath,
  "models/organization.model"
)).default;
const User = require(path.join(distPath, "models/user.model")).default;

const UserRole = {
  USER: "USER",
  ADMIN: "ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
};

const Status = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  DELETE: "delete",
};

const users = [
  {
    firstName: "Asis",
    lastName: "Uboard",
    email: "asis@uboard.com",
    password: "test123",
    organizationCode: "UBOARD",
    role: UserRole.ADMIN,
    status: Status.ACTIVE,
  },
  {
    firstName: "Arnav",
    lastName: "l",
    email: "arnav@elza.com",
    password: "test123",
    organizationCode: "ELZA",
    role: UserRole.ADMIN,
    status: Status.ACTIVE,
  },
  {
    firstName: "Accounts",
    lastName: "ELZA",
    email: "accounts@elza.co.in",
    password: "test123",
    organizationCode: "ELZA",
    role: UserRole.USER,
    status: Status.ACTIVE,
  },
  {
    firstName: "Purchase",
    lastName: "ELZA",
    email: "purchase@elza.co.in",
    password: "test123",
    organizationCode: "ELZA",
    role: UserRole.USER,
    status: Status.ACTIVE,
  },
  {
    firstName: "Nupur",
    lastName: "Kiwi User First Name",
    email: "nupur@kiwi.com",
    password: "test123",
    organizationCode: "KIWI",
    role: UserRole.USER,
    status: Status.ACTIVE,
  },
  {
    firstName: "Super",
    lastName: "Admin",
    email: "multiford3@test.com",
    password: "admin123",
    organizationCode: "KIWI",
    role: UserRole.SUPER_ADMIN,
    status: Status.ACTIVE,
  },
];

const createUsers = async () => {
  try {
    await connectDB();
    logger.info("Connected to MongoDB successfully");

    const organizations = await Organization.find({});
    const orgMap = {};
    organizations.forEach((org) => {
      orgMap[org.code] = org._id;
    });

    const userData = users
      .map((user) => {
        const orgId = orgMap[user.organizationCode];
        if (!orgId) {
          logger.error(
            `Organization with code ${user.organizationCode} not found for user ${user.email}`
          );
          return null;
        }

        return {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          password: user.password,
          organization: orgId,
          role: user.role,
          status: user.status,
          isFirstLogin: true,
        };
      })
      .filter((user) => user !== null);

    if (userData.length === 0) {
      logger.error("No valid user data to create");
      process.exit(1);
    }

    const result = await User.create(userData);
    logger.info(`Created ${result.length} users successfully`);

    result.forEach((user) => {
      const originalUser = users.find((u) => u.email === user.email);
      logger.info(
        `User: ${user.firstName} ${user.lastName}, Email: ${user.email}, Password: ${originalUser.password}, Role: ${user.role}`
      );
    });

    logger.info("Users created successfully");
    process.exit(0);
  } catch (error) {
    logger.error("Error creating users:", error);
    process.exit(1);
  }
};

createUsers();
