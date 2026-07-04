import { Injectable } from '@angular/core';
import { MasterClient } from 'mintly-lib';

/**
 * Os clients HTTP da mintly-lib (AuthClient, FinancialAccountClient, ...) só são
 * expostos publicamente através do MasterClient — não são exportados individualmente
 * pelo pacote. Mantemos uma única instância (providedIn: 'root') para reaproveitar
 * as conexões axios entre os services que precisam falar com a API.
 *
 * A instância é criada de forma lazy (via DI), nunca no top-level de um módulo:
 * os clients da lib leem `process.env.BACK_END_URL` no próprio construtor, e esse
 * polyfill só é definido em main.ts antes do bootstrap — construir o MasterClient
 * como side-effect de import poderia rodar antes do polyfill existir.
 */
@Injectable({ providedIn: 'root' })
export class MintlyClientService {
  readonly client = new MasterClient();
}
