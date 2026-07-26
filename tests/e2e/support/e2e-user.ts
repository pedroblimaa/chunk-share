import type { Locator, Page } from '@playwright/test'

export class E2EUser {
  private readonly actionDelay = Number(process.env.CHUNK_SHARE_E2E_ACTION_DELAY ?? 0)

  public constructor(private readonly page: Page) {}

  public click(locator: Locator): Promise<void> {
    return this.run(() => locator.click())
  }

  public fill(locator: Locator, value: string): Promise<void> {
    return this.run(() => locator.fill(value))
  }

  public check(locator: Locator): Promise<void> {
    return this.run(() => locator.check())
  }

  private async run(action: () => Promise<void>): Promise<void> {
    await action()

    if (this.actionDelay > 0) {
      await this.page.waitForTimeout(this.actionDelay)
    }
  }
}
