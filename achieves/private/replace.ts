import { Private } from "#/genshin/module/private/main";
import { defineDirective } from "@/modules/command";
import { privateClass } from "#/genshin/init";
import bot from "ROOT";
import { checkCookieInvalidReason, checkMysCookieInvalid, refreshTokenBySToken } from "#/genshin/utils/cookie";

export default defineDirective( "order", async ({ sendMessage, messageData, matchResult }) => {
	const userID: number = messageData.user_id;
	const newCookie = matchResult.match[0];
	/* 适配不需要序号的情况，简化用户操作 */
	await sendMessage( await replaceCookie( userID, newCookie ) );
} );

async function replaceCookie( userID: number, newCookie: string ) {
	const accounts: Private[] = privateClass.getUserPrivateList( userID );
	
	if ( newCookie === "auto" ) {
		const message: string[] = [ "自动更新Cookie结果如下：" ];
		for ( let account of accounts ) {
			try {
				const { uid, cookie } = await refreshTokenBySToken( account );
				await account.replaceCookie( cookie );
				message.push( `[ UID${ uid } ] Cookie 更新成功` );
			} catch ( error ) {
				message.push( `[ UID ${ account.setting.uid } ] ${ <string>error }` );
				message.push( `通过login_ticket授权的SToken无法用于刷新CToken` );
			}
		}
		return message.join( "\n" );
	}
	
	try {
		const { uid, mysID, cookie, stoken } = await checkMysCookieInvalid( newCookie );
		for ( let account of accounts ) {
			if ( mysID === account.setting.mysID.toString() ) {
				await account.replaceCookie( cookie, stoken );
				return `[ UID${ uid } ] CToken 更新成功`;
			}
		}
		return await privateClass.addPrivate( uid, cookie, userID, stoken );
	} catch ( error ) {
		bot.logger.error( error );
		return checkCookieInvalidReason( <string>error );
	}
}