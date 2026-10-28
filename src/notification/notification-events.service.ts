import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { NotificationEvent } from './notification-events.js';

/**
 * Barramento in-process de eventos de notificação.
 *
 * `publish` é síncrono e nunca lança: publica no Subject e retorna. O
 * `NotificationDispatchService` consome em segundo plano, portanto falhas de
 * persistência não afetam o fluxo de negócio que originou o evento.
 */
@Injectable()
export class NotificationEventsService {
  private readonly subject = new Subject<NotificationEvent>();

  readonly events$ = this.subject.asObservable();

  publish(event: NotificationEvent): void {
    this.subject.next(event);
  }
}
