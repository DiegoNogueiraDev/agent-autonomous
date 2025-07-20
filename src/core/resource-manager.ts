import { Logger } from './logger.js';

/**
 * Interface for resources that can be cleaned up
 */
export interface ManagedResource {
  cleanup(): Promise<void>;
  isCleanedUp(): boolean;
}

/**
 * Comprehensive resource manager for preventing memory leaks
 */
export class ResourceManager {
  private logger: Logger;
  private resources: Map<string, ManagedResource> = new Map();
  private isShuttingDown: boolean = false;
  private cleanupPromise: Promise<void> | null = null;

  constructor() {
    this.logger = Logger.getInstance();
    this.setupSignalHandlers();
  }

  /**
   * Register a resource for managed cleanup
   */
  register(id: string, resource: ManagedResource): void {
    if (this.isShuttingDown) {
      this.logger.warn('Cannot register resource during shutdown', { id });
      return;
    }

    this.resources.set(id, resource);
    this.logger.debug('Resource registered', { 
      id, 
      totalResources: this.resources.size 
    });
  }

  /**
   * Unregister a resource (usually after manual cleanup)
   */
  unregister(id: string): void {
    const removed = this.resources.delete(id);
    if (removed) {
      this.logger.debug('Resource unregistered', { 
        id, 
        totalResources: this.resources.size 
      });
    }
  }

  /**
   * Clean up a specific resource by ID
   */
  async cleanupResource(id: string): Promise<boolean> {
    const resource = this.resources.get(id);
    if (!resource) {
      this.logger.warn('Resource not found for cleanup', { id });
      return false;
    }

    try {
      if (!resource.isCleanedUp()) {
        await resource.cleanup();
        this.logger.debug('Resource cleaned up successfully', { id });
      }
      this.resources.delete(id);
      return true;
    } catch (error) {
      this.logger.error('Failed to cleanup resource', { 
        id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return false;
    }
  }

  /**
   * Clean up all registered resources
   */
  async cleanupAll(): Promise<void> {
    if (this.cleanupPromise) {
      return this.cleanupPromise;
    }

    this.cleanupPromise = this.performCleanupAll();
    return this.cleanupPromise;
  }

  private async performCleanupAll(): Promise<void> {
    this.isShuttingDown = true;
    this.logger.info('Starting resource cleanup', { 
      totalResources: this.resources.size 
    });

    const resourceIds = Array.from(this.resources.keys());
    const cleanupResults = await Promise.allSettled(
      resourceIds.map(async (id) => {
        const resource = this.resources.get(id);
        if (resource && !resource.isCleanedUp()) {
          await resource.cleanup();
        }
        return id;
      })
    );

    let successCount = 0;
    let failureCount = 0;

    cleanupResults.forEach((result, index) => {
      const id = resourceIds[index];
      if (result.status === 'fulfilled') {
        successCount++;
        this.logger.debug('Resource cleanup succeeded', { id });
      } else {
        failureCount++;
        this.logger.error('Resource cleanup failed', { 
          id, 
          error: result.reason 
        });
      }
    });

    this.resources.clear();

    this.logger.info('Resource cleanup completed', {
      successCount,
      failureCount,
      totalProcessed: resourceIds.length
    });
  }

  /**
   * Get resource statistics
   */
  getStats(): {
    totalResources: number;
    isShuttingDown: boolean;
    resourceIds: string[];
  } {
    return {
      totalResources: this.resources.size,
      isShuttingDown: this.isShuttingDown,
      resourceIds: Array.from(this.resources.keys())
    };
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        this.logger.info(`Received ${signal}, starting graceful shutdown`);
        
        try {
          await this.cleanupAll();
          this.logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          this.logger.error('Error during graceful shutdown', error);
          process.exit(1);
        }
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      this.logger.error('Uncaught exception, performing emergency cleanup', error);
      try {
        await this.cleanupAll();
      } catch (cleanupError) {
        this.logger.error('Emergency cleanup failed', cleanupError);
      }
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason) => {
      this.logger.error('Unhandled promise rejection, performing emergency cleanup', { reason });
      try {
        await this.cleanupAll();
      } catch (cleanupError) {
        this.logger.error('Emergency cleanup failed', cleanupError);
      }
      process.exit(1);
    });
  }

  /**
   * Create a timeout with automatic cleanup
   */
  createManagedTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    const timeoutId = setTimeout(callback, delay);
    
    // Automatically unref() to prevent keeping process alive
    timeoutId.unref();
    
    return timeoutId;
  }

  /**
   * Create an interval with automatic cleanup
   */
  createManagedInterval(callback: () => void, interval: number): NodeJS.Timeout {
    const intervalId = setInterval(callback, interval);
    
    // Automatically unref() to prevent keeping process alive
    intervalId.unref();
    
    return intervalId;
  }
}

// Global singleton instance
let globalResourceManager: ResourceManager | null = null;

/**
 * Get the global resource manager instance
 */
export function getResourceManager(): ResourceManager {
  if (!globalResourceManager) {
    globalResourceManager = new ResourceManager();
  }
  return globalResourceManager;
}

/**
 * Quick access function for registering resources
 */
export function registerResource(id: string, resource: ManagedResource): void {
  getResourceManager().register(id, resource);
}

/**
 * Quick access function for cleanup
 */
export function cleanupAllResources(): Promise<void> {
  return getResourceManager().cleanupAll();
}