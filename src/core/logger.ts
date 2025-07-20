import winston from 'winston';

export class Logger {
  private static instance: Logger;
  private static instanceLock: boolean = false;
  private logger: winston.Logger;

  private constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'datahawk' },
      transports: [
        new winston.transports.File({ 
          filename: 'logs/error.log', 
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5 
        }),
        new winston.transports.File({ 
          filename: 'logs/combined.log',
          maxsize: 5242880, // 5MB
          maxFiles: 5 
        }),
      ],
    });

    // In development, also log to console
    if (process.env.NODE_ENV !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }
  }

  public static getInstance(): Logger {
    // First check (optimization for common case)
    if (!Logger.instance) {
      // Acquire lock using a simple spin lock for Node.js single-threaded environment
      // This protects against multiple simultaneous async calls
      while (Logger.instanceLock) {
        // Simple busy wait - in Node.js this is sufficient for async concurrency
        // as we're not dealing with true multi-threading
      }
      
      Logger.instanceLock = true;
      try {
        // Second check (safety check after acquiring lock)
        if (!Logger.instance) {
          Logger.instance = new Logger();
        }
      } finally {
        // Always release the lock, even if constructor throws
        Logger.instanceLock = false;
      }
    }
    return Logger.instance;
  }

  public info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  public error(message: string, error?: Error | unknown): void {
    if (error instanceof Error) {
      this.logger.error(message, { error: error.message, stack: error.stack });
    } else {
      this.logger.error(message, { error });
    }
  }

  public warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  public debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }
}