import { ErrorMsg, signInInfoPromise, signInResultPromise } from "#/genshin/utils/promise";
import { Job } from "node-schedule";
import { Private, Service } from "./main";
import { SignInInfo } from "#/genshin/types";
import { Order } from "@/modules/command";
import bot from "ROOT";
import { getRandomNumber, randomSleep } from "@/utils/random";
import { scheduleHub } from "#/genshin/utils/schedule-hub";

export class SignInService implements Service {
	public readonly parent: Private;
	public enable: boolean;
	private job?: Job;

	public FixedField = <const>"sign";
	static FixedField = <const>"sign";

	constructor( p: Private ) {
		const options: Record<string, any> =
			p.options[SignInService.FixedField] || {};

		this.parent = p;
		this.enable = options.enable === undefined
			? false : options.enable;
	}

	public async loadedHook(): Promise<void> {
		if ( this.enable ) {
			const delay: number = getRandomNumber( 0, 99 );

			setTimeout( async () => {
				await this.sign( false );
				this.setScheduleJob();
			}, delay * 100 );
		}
	}

	public getOptions(): any {
		return { enable: this.enable };
	}

	public async initTest(): Promise<string> {
		const TOGGLE_SIGN = <Order>bot.command.getSingle( "silvery-star.private-toggle-sign" );
		const appendMsg = TOGGLE_SIGN ? `，请使用「${ TOGGLE_SIGN.getHeaders()[0] }+账户序号」开启本功能` : "";
		return `米游社签到功能已放行${ appendMsg }`;
	}

	public async toggleEnableStatus( status?: boolean, message: boolean = true ): Promise<void> {
		this.enable = status === undefined ? !this.enable : status;
		if ( this.enable ) {
			await this.sign( false );
			this.setScheduleJob();
		} else {
			this.cancelScheduleJob();
		}
		message && await this.parent.sendMessage( `米游社签到功能已${ this.enable ? "开启" : "关闭" }` );
		/* 回传进行数据库更新 */
		await this.parent.refreshDBContent( SignInService.FixedField );
	}


	private async sign( reply: boolean = true, tryTime: number = 0 ): Promise<void> {
		const { userID, uid, server, cookie } = this.parent.setting;
		try {
			const info = <SignInInfo>( await signInInfoPromise( userID, uid, server, cookie ) );
			if ( info.isSign ) {
				reply ? await this.parent.sendMessage( "您今天已在米游社签到" ) : "";
				return;
			}
			await signInResultPromise( userID, uid, server, cookie );
			await this.parent.sendMessage(
				`[UID${ uid }] - 今日签到完成，本月累计签到 ${ info.totalSignDay + 1 } 天`
			);
		} catch ( error ) {
			tryTime++;
			const errorMsg = ( <Error>error ).message;
			/* 触发验证码后再次尝试签到 */
			if ( errorMsg === ErrorMsg.VERIFICATION_CODE && tryTime <= 3 ) {
				bot.logger.info( `[genshin][sign][UID${ uid }] - 触发验证码，即将在3-5分钟后进行第${ tryTime }次重试，上限3次` );
				await randomSleep( 180, 300, true );
				await this.sign( reply, tryTime );
				return;
			}
			await this.parent.sendMessage( errorMsg );
		}
	}

	private setScheduleJob(): void {
		this.job = scheduleHub.on( "0 0 8 * * *", () => {
			const sec: number = getRandomNumber( 0, 180 );
			const time = new Date().setSeconds( sec * 10 );

			const job: Job = scheduleHub.on( time, async () => {
				await this.sign();
				scheduleHub.delete( job );
			} );
		} );
	}

	private cancelScheduleJob(): void {
		if ( this.job !== undefined ) {
			scheduleHub.delete( this.job );
		}
	}
}