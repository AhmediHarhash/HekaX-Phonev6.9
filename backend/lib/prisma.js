// ============================================================================
// HEKAX Phone - Prisma Client
// ============================================================================

const { PrismaClient } = require("@prisma/client");

// Prevent multiple instances during hot reload in development
const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
