import * as path from 'path';
import * as fs from 'fs-extra';
import { Command } from 'clipanion';
import execa from 'execa';
import { Input } from 'enquirer';
import latestVersion from 'latest-version';
import ora from 'ora';

import { Context } from '../context';
import * as Messages from '../messages';
import { getInstallCommand, getAuthor } from '../utils';
import {
  Project,
  ProjectOptions,
  AppProject,
  LibProject,
  Semver,
} from '../templates';

export class CreateCommand extends Command<Context> {
  @Command.String({ required: true })
  public type!: 'lib' | 'app';

  @Command.String({ required: true })
  public name!: string;

  @Command.String('--compiler')
  public compiler = 'tsc';

  @Command.Path('create')
  async execute(): Promise<number> {
    const targetPath = await this.getTargetPath(
      path.join(this.context.cwd, this.name)
    );

    const cdkVersion = await latestVersion('@aws-cdk/core');
    const typesAwsLambdaVersion = await latestVersion('@types/aws-lambda');

    const author = await getAuthor();

    const project = ((options: ProjectOptions): Project =>
      this.type === 'lib' ? new LibProject(options) : new AppProject(options))({
      name: this.name,
      template: 'default',
      author,
      isJsii: this.compiler === 'jsii',
      dependencyVersions: {
        cdkdx: Semver.caret(this.context.version),
        '@aws-cdk/core': Semver.caret(cdkVersion),
        '@types/aws-lambda': Semver.caret(typesAwsLambdaVersion),
      },
      targetPath,
    });

    project.synth();

    await this.installDependencies(targetPath, project.getDependencyNames());

    this.context.stdout.write(Messages.creationComplete(this.name));

    return 0;
  }

  private async getTargetPath(targetPath: string): Promise<string> {
    const exists = await fs.pathExists(targetPath);

    if (!exists) {
      return targetPath;
    }

    const prompt = new Input({
      message: `A folder named ${this.name} already exists! Choose a different name`,
      result: (value: string) => value.trim(),
    });

    this.name = await prompt.run();

    return this.getTargetPath(path.join(this.context.cwd, this.name));
  }

  private async installDependencies(
    targetPath: string,
    dependencyNames: string[]
  ): Promise<void> {
    const spinner = ora({
      text: Messages.installDependencies(dependencyNames.sort()),
      stream: this.context.stdout,
    }).start();

    try {
      const { command, args } = await getInstallCommand();
      await execa(command, args, {
        cwd: targetPath,
      });
      spinner.succeed('Dependencies installed');
    } catch (error) {
      spinner.fail('Failed to install dependencies');
      throw error;
    }
  }
}
