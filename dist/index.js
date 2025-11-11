var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// server/index.ts
import dotenv from "dotenv";
import express2 from "express";
import session from "express-session";

// server/routes.ts
import { createServer } from "http";

// server/storage.ts
import { drizzle } from "drizzle-orm/neon-serverless";
import { neonConfig } from "@neondatabase/serverless";
import { eq, desc, and, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

// shared/schema.ts
import { pgTable, text, serial, integer, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull()
});
var userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  totalCoins: integer("total_coins").default(0).notNull(),
  gamesPlayed: integer("games_played").default(0).notNull(),
  totalCorrectAnswers: integer("total_correct_answers").default(0).notNull(),
  totalQuestions: integer("total_questions").default(0).notNull(),
  highestStreak: integer("highest_streak").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var gameSessions = pgTable("game_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  difficulty: integer("difficulty").notNull(),
  questionsAnswered: integer("questions_answered").notNull(),
  correctAnswers: integer("correct_answers").notNull(),
  coinsEarned: integer("coins_earned").notNull(),
  gameMode: varchar("game_mode", { length: 50 }).default("standard").notNull(),
  completedAt: timestamp("completed_at").defaultNow().notNull()
});
var achievements = pgTable("achievements", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull(),
  icon: varchar("icon", { length: 50 }).notNull(),
  coinReward: integer("coin_reward").default(0).notNull(),
  requirement: integer("requirement").notNull(),
  category: varchar("category", { length: 50 }).notNull()
  // "games", "coins", "streak", "difficulty"
});
var userAchievements = pgTable("user_achievements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  achievementId: integer("achievement_id").references(() => achievements.id).notNull(),
  unlockedAt: timestamp("unlocked_at").defaultNow().notNull()
}, (table) => ({
  uniqueUserAchievement: {
    columns: [table.userId, table.achievementId],
    name: "unique_user_achievement"
  }
}));
var coinTransactions = pgTable("coin_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  amount: integer("amount").notNull(),
  // positive for earning, negative for spending
  type: varchar("type", { length: 50 }).notNull(),
  // "game_reward", "achievement", "shop_purchase"
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true
});
var insertUserProfileSchema = createInsertSchema(userProfiles).pick({
  userId: true,
  totalCoins: true,
  gamesPlayed: true,
  totalCorrectAnswers: true,
  totalQuestions: true,
  highestStreak: true
});
var insertGameSessionSchema = createInsertSchema(gameSessions).pick({
  userId: true,
  difficulty: true,
  questionsAnswered: true,
  correctAnswers: true,
  coinsEarned: true,
  gameMode: true
});
var insertAchievementSchema = createInsertSchema(achievements).pick({
  name: true,
  description: true,
  icon: true,
  coinReward: true,
  requirement: true,
  category: true
});
var insertUserAchievementSchema = createInsertSchema(userAchievements).pick({
  userId: true,
  achievementId: true
});
var insertCoinTransactionSchema = createInsertSchema(coinTransactions).pick({
  userId: true,
  amount: true,
  type: true,
  description: true
});

// server/storage.ts
if (!process.env.DATABASE_URL) {
  console.error("\u274C DATABASE_URL environment variable is not set");
  console.error("\u{1F4A1} Please set DATABASE_URL to connect to your database");
  console.error('\u{1F4A1} Example: $env:DATABASE_URL="postgresql://user:pass@host/db"');
}
try {
  if (typeof WebSocket !== "undefined") {
    neonConfig.webSocketConstructor = WebSocket;
  } else {
    const ws = __require("ws");
    neonConfig.webSocketConstructor = ws;
  }
} catch (error) {
  console.warn("Could not configure WebSocket for Neon:", error);
}
var db = null;
function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set. Please configure your database connection.");
  }
  if (!db) {
    db = drizzle(process.env.DATABASE_URL);
  }
  return db;
}
var PostgresStorage = class {
  // User methods
  async getUser(id) {
    const result = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }
  async getUserByUsername(username) {
    const result = await getDb().select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }
  async createUser(user) {
    const hashedPassword = await bcrypt.hash(user.password, 12);
    const userWithHashedPassword = { ...user, password: hashedPassword };
    const result = await getDb().insert(users).values(userWithHashedPassword).returning();
    const newUser = result[0];
    await this.createUserProfile(newUser.id);
    return newUser;
  }
  async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }
  // User profile methods
  async getUserProfile(userId) {
    const result = await getDb().select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
    return result[0];
  }
  async createUserProfile(userId) {
    const result = await getDb().insert(userProfiles).values({ userId }).returning();
    return result[0];
  }
  async updateUserProfile(userId, updates) {
    const result = await getDb().update(userProfiles).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq(userProfiles.userId, userId)).returning();
    return result[0];
  }
  // Game session methods
  async createGameSession(session2) {
    return await getDb().transaction(async (tx) => {
      const gameResult = await tx.insert(gameSessions).values(session2).returning();
      const gameSession = gameResult[0];
      const currentProfile = await tx.select().from(userProfiles).where(eq(userProfiles.userId, session2.userId)).limit(1);
      if (currentProfile[0]) {
        const currentStreak = session2.correctAnswers === session2.questionsAnswered ? currentProfile[0].highestStreak + session2.correctAnswers : 0;
        await tx.update(userProfiles).set({
          gamesPlayed: currentProfile[0].gamesPlayed + 1,
          totalCorrectAnswers: currentProfile[0].totalCorrectAnswers + session2.correctAnswers,
          totalQuestions: currentProfile[0].totalQuestions + session2.questionsAnswered,
          highestStreak: Math.max(currentProfile[0].highestStreak, currentStreak),
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq(userProfiles.userId, session2.userId));
        if (session2.coinsEarned > 0) {
          await tx.insert(coinTransactions).values({
            userId: session2.userId,
            amount: session2.coinsEarned,
            type: "game_reward",
            description: `Game completed: ${session2.correctAnswers}/${session2.questionsAnswered} correct`
          });
          await tx.update(userProfiles).set({
            totalCoins: sql`${userProfiles.totalCoins} + ${session2.coinsEarned}`,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(eq(userProfiles.userId, session2.userId));
        }
      }
      return gameSession;
    });
  }
  async getUserGameSessions(userId, limit = 10) {
    return await getDb().select().from(gameSessions).where(eq(gameSessions.userId, userId)).orderBy(desc(gameSessions.completedAt)).limit(limit);
  }
  // Achievement methods
  async getAllAchievements() {
    return await getDb().select().from(achievements);
  }
  async getUserAchievements(userId) {
    const result = await getDb().select({
      id: userAchievements.id,
      userId: userAchievements.userId,
      achievementId: userAchievements.achievementId,
      unlockedAt: userAchievements.unlockedAt,
      achievement: achievements
    }).from(userAchievements).innerJoin(achievements, eq(userAchievements.achievementId, achievements.id)).where(eq(userAchievements.userId, userId)).orderBy(desc(userAchievements.unlockedAt));
    return result;
  }
  async unlockAchievement(userId, achievementId) {
    return await getDb().transaction(async (tx) => {
      try {
        const result = await tx.insert(userAchievements).values({ userId, achievementId }).returning();
        const achievement = await tx.select().from(achievements).where(eq(achievements.id, achievementId)).limit(1);
        if (achievement[0]?.coinReward > 0) {
          await tx.insert(coinTransactions).values({
            userId,
            amount: achievement[0].coinReward,
            type: "achievement",
            description: `Achievement: ${achievement[0].name}`
          });
          await tx.update(userProfiles).set({
            totalCoins: sql`${userProfiles.totalCoins} + ${achievement[0].coinReward}`,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(eq(userProfiles.userId, userId));
        }
        return result[0];
      } catch (error) {
        const existing = await tx.select().from(userAchievements).where(and(eq(userAchievements.userId, userId), eq(userAchievements.achievementId, achievementId))).limit(1);
        return existing[0];
      }
    });
  }
  async checkAndUnlockAchievements(userId, profile) {
    const allAchievements = await this.getAllAchievements();
    const userAchievements2 = await this.getUserAchievements(userId);
    const unlockedIds = new Set(userAchievements2.map((ua) => ua.achievementId));
    const newlyUnlocked = [];
    const recentSessions = await this.getUserGameSessions(userId, 50);
    const difficultyLevelsCompleted = new Set(recentSessions.map((s) => s.difficulty));
    for (const achievement of allAchievements) {
      if (unlockedIds.has(achievement.id)) continue;
      let shouldUnlock = false;
      switch (achievement.category) {
        case "games":
          shouldUnlock = profile.gamesPlayed >= achievement.requirement;
          break;
        case "coins":
          shouldUnlock = profile.totalCoins >= achievement.requirement;
          break;
        case "streak":
          shouldUnlock = profile.highestStreak >= achievement.requirement;
          break;
        case "accuracy":
          const accuracy = profile.totalQuestions > 0 ? profile.totalCorrectAnswers / profile.totalQuestions * 100 : 0;
          shouldUnlock = accuracy >= achievement.requirement;
          break;
        case "difficulty":
          const completedLevels = difficultyLevelsCompleted.size;
          shouldUnlock = completedLevels >= achievement.requirement;
          break;
        case "speed":
          shouldUnlock = profile.totalCorrectAnswers >= achievement.requirement;
          break;
        case "perfect_game":
          const perfectGames = recentSessions.filter(
            (s) => s.questionsAnswered >= 10 && s.correctAnswers === s.questionsAnswered
          );
          shouldUnlock = perfectGames.length > 0;
          break;
        case "consistency":
          const recentGames = recentSessions.slice(0, achievement.requirement);
          if (recentGames.length >= achievement.requirement) {
            const consistentAccuracy = recentGames.every(
              (game) => game.questionsAnswered > 0 && game.correctAnswers / game.questionsAnswered >= 0.8
            );
            shouldUnlock = consistentAccuracy;
          }
          break;
        case "daily_streak":
          shouldUnlock = profile.gamesPlayed >= achievement.requirement;
          break;
      }
      if (shouldUnlock) {
        await this.unlockAchievement(userId, achievement.id);
        newlyUnlocked.push(achievement);
      }
    }
    return newlyUnlocked;
  }
  // Coin transaction methods
  async addCoins(userId, amount, type, description) {
    return await getDb().transaction(async (tx) => {
      const transaction = await tx.insert(coinTransactions).values({
        userId,
        amount,
        type,
        description
      }).returning();
      await tx.update(userProfiles).set({
        totalCoins: sql`${userProfiles.totalCoins} + ${amount}`,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(userProfiles.userId, userId));
      return transaction[0];
    });
  }
  async spendCoins(userId, amount, description) {
    return await getDb().transaction(async (tx) => {
      const updateResult = await tx.update(userProfiles).set({
        totalCoins: sql`${userProfiles.totalCoins} - ${amount}`,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(and(
        eq(userProfiles.userId, userId),
        sql`${userProfiles.totalCoins} >= ${amount}`
      )).returning();
      if (updateResult.length === 0) {
        throw new Error("Insufficient coins");
      }
      const transaction = await tx.insert(coinTransactions).values({
        userId,
        amount: -amount,
        type: "shop_purchase",
        description
      }).returning();
      return transaction[0];
    });
  }
  async getCoinTransactions(userId, limit = 10) {
    return await getDb().select().from(coinTransactions).where(eq(coinTransactions.userId, userId)).orderBy(desc(coinTransactions.createdAt)).limit(limit);
  }
  // Game statistics
  async getLeaderboard(limit = 10) {
    const result = await getDb().select({
      id: userProfiles.id,
      userId: userProfiles.userId,
      totalCoins: userProfiles.totalCoins,
      gamesPlayed: userProfiles.gamesPlayed,
      totalCorrectAnswers: userProfiles.totalCorrectAnswers,
      totalQuestions: userProfiles.totalQuestions,
      highestStreak: userProfiles.highestStreak,
      createdAt: userProfiles.createdAt,
      updatedAt: userProfiles.updatedAt,
      user: users
    }).from(userProfiles).innerJoin(users, eq(userProfiles.userId, users.id)).orderBy(desc(userProfiles.totalCoins)).limit(limit);
    return result;
  }
};
var storage = new PostgresStorage();

// server/routes.ts
var requireAuth = (req, res, next) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
};
function registerRoutesOnly(app2) {
  app2.post("/api/auth/signup", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ error: "Username already exists" });
      }
      const user = await storage.createUser({ username, password });
      const profile = await storage.getUserProfile(user.id);
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ error: "Failed to create session" });
        }
        res.json({
          user: { id: user.id, username: user.username },
          profile,
          achievements: []
        });
      });
    } catch (error) {
      console.error("Signup error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("DATABASE_URL")) {
        return res.status(500).json({
          error: "Database not configured. Please set DATABASE_URL environment variable.",
          details: "See DATABASE_SETUP.md for instructions"
        });
      }
      if (errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("table")) {
        return res.status(500).json({
          error: "Database tables not found. Please run 'npm run db:push' to create the schema.",
          details: errorMessage
        });
      }
      res.status(500).json({
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? errorMessage : void 0
      });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const isValidPassword = await storage.verifyPassword(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const profile = await storage.getUserProfile(user.id);
      const achievements2 = await storage.getUserAchievements(user.id);
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ error: "Failed to create session" });
        }
        res.json({
          user: { id: user.id, username: user.username },
          profile,
          achievements: achievements2
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("DATABASE_URL")) {
        return res.status(500).json({
          error: "Database not configured. Please set DATABASE_URL environment variable.",
          details: "See DATABASE_SETUP.md for instructions"
        });
      }
      if (errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("table")) {
        return res.status(500).json({
          error: "Database tables not found. Please run 'npm run db:push' to create the schema.",
          details: errorMessage
        });
      }
      res.status(500).json({
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? errorMessage : void 0
      });
    }
  });
  app2.get("/api/auth/me", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const userId = req.session.userId;
      const user = await storage.getUser(userId);
      const profile = await storage.getUserProfile(userId);
      const achievements2 = await storage.getUserAchievements(userId);
      if (!user) {
        req.session.destroy(() => {
        });
        return res.status(401).json({ error: "User not found" });
      }
      res.json({
        user: { id: user.id, username: user.username },
        profile,
        achievements: achievements2
      });
    } catch (error) {
      console.error("Session check error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/auth/logout", requireAuth, async (req, res) => {
    try {
      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({ error: "Failed to logout" });
        }
        res.json({ success: true });
      });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/profile", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const profile = await storage.getUserProfile(userId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/game/complete", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { difficulty, questionsAnswered, correctAnswers, coinsEarned, gameMode = "standard" } = req.body;
      if (!difficulty || questionsAnswered === void 0 || correctAnswers === void 0 || coinsEarned === void 0) {
        return res.status(400).json({ error: "Missing required game session data" });
      }
      const gameSession = await storage.createGameSession({
        userId,
        difficulty,
        questionsAnswered,
        correctAnswers,
        coinsEarned,
        gameMode
      });
      const profile = await storage.getUserProfile(userId);
      if (profile) {
        const newAchievements = await storage.checkAndUnlockAchievements(userId, profile);
        res.json({
          gameSession,
          profile,
          newAchievements
        });
      } else {
        res.json({ gameSession });
      }
    } catch (error) {
      console.error("Complete game error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/game/sessions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const limit = parseInt(req.query.limit) || 10;
      const sessions = await storage.getUserGameSessions(userId, limit);
      res.json(sessions);
    } catch (error) {
      console.error("Get sessions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/achievements", requireAuth, async (req, res) => {
    try {
      const achievements2 = await storage.getAllAchievements();
      res.json(achievements2);
    } catch (error) {
      console.error("Get achievements error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/achievements/user", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const userAchievements2 = await storage.getUserAchievements(userId);
      res.json(userAchievements2);
    } catch (error) {
      console.error("Get user achievements error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/coins/spend", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { amount, description } = req.body;
      if (!amount || !description) {
        return res.status(400).json({ error: "Missing required data for coin transaction" });
      }
      const transaction = await storage.spendCoins(userId, parseInt(amount), description);
      const profile = await storage.getUserProfile(userId);
      res.json({ transaction, profile });
    } catch (error) {
      if (error instanceof Error && error.message === "Insufficient coins") {
        return res.status(400).json({ error: "Insufficient coins" });
      }
      console.error("Spend coins error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/coins/transactions", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const limit = parseInt(req.query.limit) || 10;
      const transactions = await storage.getCoinTransactions(userId, limit);
      res.json(transactions);
    } catch (error) {
      console.error("Get transactions error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/leaderboard", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const leaderboard = await storage.getLeaderboard(limit);
      res.json(leaderboard);
    } catch (error) {
      console.error("Get leaderboard error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
async function registerRoutes(app2) {
  registerRoutesOnly(app2);
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2, { dirname as dirname2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path, { dirname } from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";
import glsl from "vite-plugin-glsl";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    glsl()
    // Add GLSL shader support
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared")
    }
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true
  },
  // Add support for large models and audio files
  assetsInclude: ["**/*.gltf", "**/*.glb", "**/*.mp3", "**/*.ogg", "**/*.wav"]
});

// server/vite.ts
import { nanoid } from "nanoid";
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = dirname2(__filename2);
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        __dirname2,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(__dirname2, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
dotenv.config();
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || "your-secret-key-here",
  resave: true,
  // Changed to true to ensure session is saved
  saveUninitialized: false,
  cookie: {
    secure: false,
    // Set to true in production with HTTPS
    httpOnly: true,
    sameSite: "lax",
    // Added for better cookie handling
    maxAge: 24 * 60 * 60 * 1e3
    // 24 hours
  },
  name: "tabletrek.sid"
  // Explicit session name
}));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  try {
    if (!process.env.DATABASE_URL) {
      log("\u26A0\uFE0F  WARNING: DATABASE_URL environment variable is not set!");
      log("\u26A0\uFE0F  The server will start but API routes will fail.");
      log("\u26A0\uFE0F  Please set DATABASE_URL to connect to your database.");
      log('\u26A0\uFE0F  Example: $env:DATABASE_URL="postgresql://user:pass@host/db"');
    }
    const server = await registerRoutes(app);
    app.use((err, _req, res, _next) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
      throw err;
    });
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }
    const port = 5e3;
    const host = "0.0.0.0";
    if (process.platform === "win32") {
      server.listen(port, host, () => {
        log(`serving on port ${port}`);
        if (!process.env.DATABASE_URL) {
          log("\u26A0\uFE0F  Server started without database connection - API routes will not work");
        }
      });
    } else {
      server.listen({
        port,
        host,
        reusePort: true
      }, () => {
        log(`serving on port ${port}`);
        if (!process.env.DATABASE_URL) {
          log("\u26A0\uFE0F  Server started without database connection - API routes will not work");
        }
      });
    }
  } catch (error) {
    log(`\u274C Failed to start server: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.message.includes("DATABASE_URL")) {
      log("\u{1F4A1} Please set DATABASE_URL environment variable to start the server");
      log("\u{1F4A1} See DATABASE_SETUP.md for instructions");
    }
    process.exit(1);
  }
})();
