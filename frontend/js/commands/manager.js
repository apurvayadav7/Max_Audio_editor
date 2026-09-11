/**
 * Command Architecture & Undo/Redo Engine
 * 100-level non-destructive undo/redo history with compound commands and state synchronization.
 */

import { bus } from "../core/event-bus.js";
import { projectManager } from "../state/project.js";

export class Command {
  constructor(description = "Edit") {
    this.description = description;
    this.timestamp = new Date();
  }

  async execute() {
    throw new Error("Command.execute() must be implemented by subclass");
  }

  async undo() {
    throw new Error("Command.undo() must be implemented by subclass");
  }

  async redo() {
    return await this.execute();
  }
}

export class CompoundCommand extends Command {
  constructor(description = "Batch Edit", commands = []) {
    super(description);
    this.commands = commands;
  }

  add(command) {
    this.commands.push(command);
  }

  async execute() {
    for (const cmd of this.commands) {
      await cmd.execute();
    }
  }

  async undo() {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      await this.commands[i].undo();
    }
  }

  async redo() {
    for (const cmd of this.commands) {
      await cmd.redo();
    }
  }
}

export class CommandManager {
  constructor(maxHistory = 100) {
    this.maxHistory = maxHistory;
    this.undoStack = [];
    this.redoStack = [];
    this.isExecuting = false;
  }

  async execute(command) {
    if (this.isExecuting) return;
    this.isExecuting = true;

    try {
      await command.execute();
      this.undoStack.push(command);
      this.redoStack = []; // Clear redo stack on new action

      if (this.undoStack.length > this.maxHistory) {
        this.undoStack.shift();
      }

      // Automatically persist project changes
      await projectManager.saveCurrentProject();

      bus.emit("command:executed", command);
      bus.emit("command:stack-changed", this.getStackInfo());
      console.log(`[CommandManager] Executed: ${command.description} (Undo stack: ${this.undoStack.length})`);
    } catch (err) {
      console.error(`[CommandManager] Failed to execute command '${command.description}':`, err);
      throw err;
    } finally {
      this.isExecuting = false;
    }
  }

  async undo() {
    if (this.undoStack.length === 0 || this.isExecuting) return false;
    this.isExecuting = true;

    const command = this.undoStack.pop();
    try {
      await command.undo();
      this.redoStack.push(command);

      await projectManager.saveCurrentProject();

      bus.emit("command:undone", command);
      bus.emit("command:stack-changed", this.getStackInfo());
      console.log(`[CommandManager] Undone: ${command.description} (Remaining: ${this.undoStack.length})`);
      return true;
    } catch (err) {
      console.error(`[CommandManager] Failed to undo command '${command.description}':`, err);
      // Put it back to keep consistent state
      this.undoStack.push(command);
      throw err;
    } finally {
      this.isExecuting = false;
    }
  }

  async redo() {
    if (this.redoStack.length === 0 || this.isExecuting) return false;
    this.isExecuting = true;

    const command = this.redoStack.pop();
    try {
      await command.redo();
      this.undoStack.push(command);

      await projectManager.saveCurrentProject();

      bus.emit("command:redone", command);
      bus.emit("command:stack-changed", this.getStackInfo());
      console.log(`[CommandManager] Redone: ${command.description}`);
      return true;
    } catch (err) {
      console.error(`[CommandManager] Failed to redo command '${command.description}':`, err);
      this.redoStack.push(command);
      throw err;
    } finally {
      this.isExecuting = false;
    }
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    bus.emit("command:stack-changed", this.getStackInfo());
  }

  getStackInfo() {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      history: this.getHistory(),
      currentIndex: this.undoStack.length - 1,
    };
  }

  getHistory() {
    const history = [];
    this.undoStack.forEach((cmd, idx) => {
      history.push({
        index: idx,
        description: cmd.description,
        timestamp: cmd.timestamp,
        type: "applied",
      });
    });
    this.redoStack.slice().reverse().forEach((cmd, idx) => {
      history.push({
        index: this.undoStack.length + idx,
        description: cmd.description,
        timestamp: cmd.timestamp,
        type: "undone",
      });
    });
    return history;
  }

  async jumpTo(targetIndex) {
    const currentIndex = this.undoStack.length - 1;
    if (targetIndex === currentIndex) return;

    if (targetIndex < currentIndex) {
      // Undo steps
      const steps = currentIndex - targetIndex;
      for (let i = 0; i < steps; i++) {
        await this.undo();
      }
    } else {
      // Redo steps
      const steps = targetIndex - currentIndex;
      for (let i = 0; i < steps; i++) {
        await this.redo();
      }
    }
  }
}

export const commandManager = new CommandManager(100);
