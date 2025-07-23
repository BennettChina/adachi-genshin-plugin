import bot from "ROOT";
import { toCamelCase } from "./camel-case";
import { guid } from "#/genshin/utils/guid";
import { generateDS, getDS, getDS2 } from "./ds";
import * as ApiType from "#/genshin/types";
import { ResponseBody } from "#/genshin/types";
import { config } from "#/genshin/init";
import { register } from "@/utils/request";
import { getMiHoYoRandomStr } from "./random";
import { getRandomString, randomSleep } from "@/utils/random";
import { getDeviceRequestBody } from "./device-fp";
import { getRegion } from "#/genshin/utils/region";
import { ErrorMsg } from "#/genshin/utils/promise";
import { IDeviceData, IFpData } from "#/genshin/types/device";
import { Md5 } from "md5-typescript";

const apis = {
	FETCH_ROLE_ID: "https://api-takumi-record.mihoyo.com/game_record/app/card/wapi/getGameRecordCard",
	FETCH_ROLE_INDEX: "https://api-takumi-record.mihoyo.com/game_record/app/genshin/api/index",
	FETCH_ROLE_CHARACTERS: "https://api-takumi-record.mihoyo.com/game_record/app/genshin/api/character",
	FETCH_ROLE_SPIRAL_ABYSS: "https://api-takumi-record.mihoyo.com/game_record/app/genshin/api/spiralAbyss",
	FETCH_ROLE_DAILY_NOTE: "https://api-takumi-record.mihoyo.com/game_record/app/genshin/api/dailyNote",
	FETCH_ROLE_AVATAR_DETAIL: "https://api-takumi.mihoyo.com/event/e20200928calculate/v1/sync/avatar/detail",
	FETCH_GACHA_LIST: "https://operation-webstatic.mihoyo.com/gacha_info/hk4e/cn_gf01/gacha/list.json",
	FETCH_GACHA_DETAIL: "https://operation-webstatic.mihoyo.com/gacha_info/hk4e/cn_gf01/$/zh-cn.json",
	
	FETCH_SIGN_IN: "https://api-takumi.mihoyo.com/event/luna/sign",
	FETCH_SIGN_INFO: "https://api-takumi.mihoyo.com/event/luna/info",
	FETCH_LEDGER: "https://hk4e-api.mihoyo.com/event/ys_ledger/monthInfo",
	FETCH_CALENDAR_LIST: "https://hk4e-api.mihoyo.com/common/hk4e_cn/announcement/api/getAnnList",
	FETCH_CALENDAR_DETAIL: "https://hk4e-api.mihoyo.com/common/hk4e_cn/announcement/api/getAnnContent",
	//验证码服务相关
	FETCH_CREATE_VERIFICATION: "https://api-takumi-record.mihoyo.com/game_record/app/card/wapi/createVerification",
	FETCH_GEETEST: "https://api.geetest.com/gettype.php",
	FETCH_GET_VERIFY: "https://api.sayu-bot.com/geetest",
	FETCH_VERIFY_VERIFICATION: "https://api-takumi-record.mihoyo.com/game_record/app/card/wapi/verifyVerification",
	/* Token转换相关 */
	FETCH_GET_MULTI_TOKEN: "https://api-takumi.mihoyo.com/auth/api/getMultiTokenByLoginTicket",
	FETCH_GET_COOKIE_TOKEN: "https://api-takumi.mihoyo.com/auth/api/getCookieAccountInfoBySToken",
	FETCH_VERIFY_LTOKEN: "https://passport-api-v4.mihoyo.com/account/ma-cn-session/web/verifyLtoken",
	FETCH_GET_LTOKEN_BY_STOKEN: "https://passport-api.mihoyo.com/account/auth/api/getLTokenBySToken",
	/* 获取device_fp */
	FETCH_GET_DEVICE_FP: "https://public-data-api.mihoyo.com/device-fp/api/getFp",
	FETCH_DEVICE_LOGIN: "https://bbs-api.miyoushe.com/apihub/api/deviceLogin",
	FETCH_SAVE_DEVICE: "https://bbs-api.miyoushe.com/apihub/api/saveDevice",
	/* enka */
	FETCH_ENKA_CHARA_DETAIL: "api/uid/$"
};


function getCommonHeaders( cookie?: string, ds?: string, deviceId = "", deviceFp = "" ) {
	const headers: Record<string, any> = {
		"User-Agent": "Mozilla/5.0 (Linux; Android 11; J9110 Build/55.2.A.4.332; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.179 Mobile Safari/537.36 miHoYoBBS/2.73.1",
		"Referer": "https://act.mihoyo.com/",
		"Origin": "https://act.mihoyo.com",
		"x-rpc-app_version": "2.73.1",
		'x-rpc-sys_version': '12',
		'x-rpc-client_type': '2',
		'x-rpc-channel': 'mihoyo',
		"x-rpc-device_id": deviceId,
		"x-rpc-device_fp": deviceFp
	}
	cookie && ( headers.Cookie = cookie );
	ds && ( headers.DS = ds );
	return headers;
}

const verifyMsg = "API请求遭遇验证码拦截，可以尝试联系Master开启验证服务";

const { request: $https } = register( {
	timeout: 60000,
	responseType: "json",
}, apis );

/* mihoyo BBS API */
export async function getBaseInfo(
	uid: number,
	mysID: number,
	cookie: string,
	time: number = 0,
	verifyResult: string = ""
): Promise<ResponseBody<ApiType.BBS>> {
	const query = { uid: mysID };
	const { data: result } = await $https.FETCH_ROLE_ID.get( query, {
		headers: getCommonHeaders( cookie, getDS( query ) )
	} )
	const data: ResponseBody<ApiType.BBS> = toCamelCase( result );
	if ( data.retcode !== 1034 ) {
		return data;
	}
	bot.logger.warn( `[genshin][base][ MysID${ mysID } ]查询遇到验证码` );
	if ( config.verify.enable && time <= config.verify.repeat ) {
		verifyResult = await bypassQueryVerification( cookie );
		bot.logger.debug( `[genshin][base][ MysID${ mysID } ]第 ${ time + 1 } 次验证码绕过${ verifyResult ? "失败：" + verifyResult : "成功" }` );
		return await getBaseInfo( uid, mysID, cookie, ++time, verifyResult );
	}
	throw config.verify.enable ? "[base] " + verifyResult : verifyMsg;
}

export async function getDetailInfo(
	userId: number | string,
	uid: number,
	cookie: string,
	time: number = 0,
	verifyResult: string = ''
): Promise<ResponseBody<ApiType.UserInfo>> {
	const server = getRegion( uid.toString()[0] );
	const query = {
		role_id: uid,
		server
	};
	const { device_id, device_fp } = await getDeviceFp( userId, cookie );
	const { data: result } = await $https.FETCH_ROLE_INDEX.get( query, {
		headers: getCommonHeaders( cookie, getDS( query ), device_id, device_fp )
	} );
	const data: ResponseBody<ApiType.UserInfo> = toCamelCase( result );
	if ( data.retcode !== 1034 ) {
		return data;
	}
	bot.logger.warn( `[genshin][detail][ UID${ uid } ]查询遇到验证码` );
	if ( config.verify.enable && time <= config.verify.repeat ) {
		verifyResult = await bypassQueryVerification( cookie );
		bot.logger.debug( `[genshin][detail][ UID${ uid } ]第 ${ time + 1 } 次验证码绕过${ verifyResult ? "失败：" + verifyResult : "成功" }` );
		return await getDetailInfo( userId, uid, cookie, ++time, verifyResult );
	}
	throw config.verify.enable ? "[detail] " + verifyResult : verifyMsg;
}

export async function getCharactersInfo(
	userId: number | string,
	uid: number,
	charIDs: number[],
	cookie: string,
	time: number = 0,
	verifyResult: string = ''
): Promise<ResponseBody<ApiType.Character>> {
	const server = getRegion( uid.toString()[0] );
	
	const body = {
		character_ids: charIDs,
		role_id: uid,
		server
	};
	
	const { device_id, device_fp } = await getDeviceFp( userId, cookie );
	const { data: result } = await $https.FETCH_ROLE_CHARACTERS.post( body, {
		headers: {
			...getCommonHeaders( cookie, getDS( body ), device_id, device_fp ),
			"content-type": "application/json"
		}
	} );
	
	const data: ResponseBody<ApiType.Character> = toCamelCase( result );
	if ( data.retcode !== 1034 ) {
		return data;
	}
	bot.logger.warn( `[genshin][char][ UID${ uid } ] 查询遇到验证码` );
	if ( config.verify.enable && time <= config.verify.repeat ) {
		verifyResult = await bypassQueryVerification( cookie );
		bot.logger.debug( `[genshin][char][ UID${ uid } ]第 ${ time + 1 } 次验证码绕过${ verifyResult ? "失败：" + verifyResult : "成功" }` );
		return await getCharactersInfo( userId, uid, charIDs, cookie, ++time, verifyResult );
	}
	throw config.verify.enable ? "[char] " + verifyResult : verifyMsg;
}

export async function getDailyNoteInfo(
	userId: number | string,
	uid: number,
	cookie: string,
	time: number = 0,
	verifyResult: string = ''
): Promise<ResponseBody<ApiType.Note>> {
	const server = getRegion( uid.toString()[0] );
	const query = {
		role_id: uid,
		server
	};
	const { device_id, device_fp } = await getDeviceFp( userId, cookie );
	const { data: result } = await $https.FETCH_ROLE_DAILY_NOTE.get( query, {
		headers: getCommonHeaders( cookie, getDS( query ), device_id, device_fp )
	} )
	const data: ResponseBody<ApiType.Note> = toCamelCase( result );
	if ( data.retcode !== 1034 ) {
		return data;
	}
	bot.logger.warn( `[genshin][note][ UID${ uid } ]查询遇到验证码` );
	if ( config.verify.enable && time <= config.verify.repeat ) {
		verifyResult = await bypassQueryVerification( cookie );
		bot.logger.debug( `[genshin][note][ UID${ uid } ]第 ${ time + 1 } 次验证码绕过${ verifyResult ? "失败：" + verifyResult : "成功" }` );
		return await getDailyNoteInfo( userId, uid, cookie, ++time, verifyResult );
	}
	throw config.verify.enable ? "[note] " + verifyResult : verifyMsg;
}

export async function getAvatarDetailInfo(
	userId: number | string,
	uid: string,
	avatarID: number,
	cookie: string,
	time: number = 0,
	verifyResult: string = ''
): Promise<ResponseBody<ApiType.AvatarDetailRaw>> {
	const server = getRegion( uid.toString()[0] );
	const query = {
		avatar_id: avatarID,
		region: server,
		uid
	};
	const { device_id, device_fp } = await getDeviceFp( userId, cookie );
	const { data: result } = await $https.FETCH_ROLE_AVATAR_DETAIL.get( query, {
		headers: getCommonHeaders( cookie, getDS( query ), device_id, device_fp )
	} );
	const data: ResponseBody<ApiType.AvatarDetailRaw> = toCamelCase( result );
	if ( data.retcode !== 1034 ) {
		return data;
	}
	bot.logger.warn( `[genshin][avatar][ UID${ uid } ]查询遇到验证码` );
	if ( config.verify.enable && time <= config.verify.repeat ) {
		verifyResult = await bypassQueryVerification( cookie );
		bot.logger.debug( `[genshin][avatar][ UID${ uid } ]第 ${ time + 1 } 次验证码绕过${ verifyResult ? "失败：" + verifyResult : "成功" }` );
		return await getAvatarDetailInfo( userId, uid, avatarID, cookie, ++time, verifyResult );
	}
	throw config.verify.enable ? "[avatar] " + verifyResult : verifyMsg;
}

/* period 为 1 时表示本期深渊，2 时为上期深渊 */
export async function getSpiralAbyssInfo(
	userId: number | string,
	uid: number,
	period: number,
	cookie: string,
	time: number = 0,
	verifyResult: string = ''
): Promise<ResponseBody<ApiType.Abyss>> {
	const server = getRegion( uid.toString()[0] );
	const query = {
		role_id: uid,
		schedule_type: period,
		server
	};
	const { device_id, device_fp } = await getDeviceFp( userId, cookie );
	const { data: result } = await $https.FETCH_ROLE_SPIRAL_ABYSS.get( query, {
		headers: getCommonHeaders( cookie, getDS( query ), device_id, device_fp )
	} )
	const data: ResponseBody<ApiType.Abyss> = toCamelCase( result );
	if ( data.retcode !== 1034 ) {
		return data;
	}
	bot.logger.warn( `[genshin][abyss][ UID${ uid } ]查询遇到验证码` );
	if ( config.verify.enable && time <= config.verify.repeat ) {
		verifyResult = await bypassQueryVerification( cookie );
		bot.logger.debug( `[genshin][abyss][ UID${ uid } ]第 ${ time + 1 } 次验证码绕过${ verifyResult ? "失败：" + verifyResult : "成功" }` );
		return await getSpiralAbyssInfo( userId, uid, period, cookie, ++time, verifyResult );
	}
	throw config.verify.enable ? "[abyss] " + verifyResult : verifyMsg;
}

export async function getLedger(
	userId: number | string,
	uid: string,
	mon: number,
	cookie: string,
	time: number = 0,
	verifyResult: string = ''
): Promise<ResponseBody<ApiType.Ledger>> {
	const server = getRegion( uid.toString()[0] );
	const query = {
		bind_uid: uid,
		bind_region: server,
		month: mon
	};
	
	const { device_id, device_fp } = await getDeviceFp( userId, cookie );
	const { data: result } = await $https.FETCH_LEDGER.get( query, {
		headers: getCommonHeaders( cookie, undefined, device_id, device_fp )
	} );
	const data: ResponseBody<ApiType.Ledger> = toCamelCase( result );
	if ( data.retcode !== 1034 ) {
		return data;
	}
	bot.logger.warn( `[genshin][ledger][ UID${ uid } ]查询遇到验证码` );
	if ( config.verify.enable && time <= config.verify.repeat ) {
		verifyResult = await bypassQueryVerification( cookie );
		bot.logger.debug( `[genshin][ledger][ UID${ uid } ]第 ${ time + 1 } 次验证码绕过${ verifyResult ? "失败：" + verifyResult : "成功" }` );
		return await getLedger( userId, uid, mon, cookie, ++time, verifyResult );
	}
	throw config.verify.enable ? "[ledger] " + verifyResult : verifyMsg;
}

export async function getWishList(): Promise<ResponseBody<ApiType.WishList>> {
	const { data: result } = await $https.FETCH_GACHA_LIST.get();
	if ( !result.data ) {
		throw result.message;
	}
	return toCamelCase( result );
}

export async function getWishDetail( wishID: string ): Promise<ApiType.WishDetail> {
	const { data } = await $https.FETCH_GACHA_DETAIL.get( {}, url => url.replace( "$", wishID ) );
	return toCamelCase( data );
}

/* calender API */
const calc_query = {
	game: "hk4e",
	game_biz: "hk4e_cn",
	lang: "zh-cn",
	bundle_id: "hk4e_cn",
	platform: "pc",
	region: "cn_gf01",
	level: "55",
	uid: "100000000"
};

export async function getCalendarList(): Promise<ResponseBody<ApiType.CalendarList>> {
	const { data: result } = await $https.FETCH_CALENDAR_LIST.get( calc_query );
	if ( !result.data ) {
		throw result.message;
	}
	return toCamelCase( result );
}

export async function getCalendarDetail(): Promise<ResponseBody<ApiType.CalendarDetail>> {
	const { data: result } = await $https.FETCH_CALENDAR_DETAIL.get( calc_query );
	if ( !result.data ) {
		throw result.message;
	}
	return toCamelCase( result );
}

/* 参考 https://github.com/DGP-Studio/DGP.Genshin.MiHoYoAPI/blob/main/Sign/SignInProvider.cs */
const activityID: string = "e202311201442471";

async function getSignHeaders( userId: number | string, cookie: string, ds = true ) {
	const deviceName = getRandomString( 5 );
	const { device_id, device_fp } = await getDeviceFp( userId, cookie );
	return {
		Host: "api-takumi.mihoyo.com",
		Connection: "keep-alive",
		"x-rpc-signgame": "hk4e",
		Accept: "application/json, text/plain, */*",
		Origin: "https://act.mihoyo.com",
		"X-Requested-With": "com.mihoyo.hyperion",
		"Sec-Fetch-Site": "same-site",
		"Sec-Fetch-Mode": "cors",
		"Sec-Fetch-Dest": "empty",
		Referer: "https://act.mihoyo.com/",
		"Accept-Encoding": "gzip, deflate",
		"Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
		"content-type": "application/json",
		"x-rpc-app_version": "2.40.1",
		"x-rpc-device_id": device_id,
		"x-rpc-client_type": "5",
		"User-Agent": `Mozilla/5.0 (Linux; Android 12; ADC-${ deviceName }) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.73 Mobile Safari/537.36 miHoYoBBS/2.40.1`,
		"x-rpc-platform": "android",
		"x-rpc-device_model": "Mi 10",
		"x-rpc-device_name": deviceName,
		"x-rpc-channel": 'miyousheluodi',
		"x-rpc-sys_version": '6.0.1',
		Cookie: cookie,
		"x-rpc-device_fp": device_fp,
		"DS": ds ? getDS2() : ""
	}
}

/* Sign In API */
export async function mihoyoBBSSignIn( userId: number | string, uid: string, region: string, cookie: string, time: number = 0 ): Promise<ResponseBody<ApiType.SignInResult>> {
	const body = {
		act_id: activityID,
		uid, region
	};
	
	const { data: result } = await $https.FETCH_SIGN_IN.post( body, {
		headers: await getSignHeaders( userId, cookie )
	} );
	if ( !result.data ) {
		throw new Error( ErrorMsg.FORM_MESSAGE + ( result.message || "签到 api 异常" ) );
	}
	const resp: ResponseBody<ApiType.SignInResult> = toCamelCase( result );
	if ( !resp.data.gt && resp.data.success === 0 ) {
		return resp;
	}
	//遇到验证码
	bot.logger.warn( `[genshin][sign][ UID${ uid } ]签到遇到验证码` );
	if ( resp.data.gt && resp.data.challenge ) {
		bot.logger.debug( `[genshin][sign][ UID${ uid } ]遇到验证码，尝试绕过 ~` );
		return mihoyoBBSVerifySignIn( userId, uid, region, cookie, resp.data.gt, resp.data.challenge );
	}
	throw new Error( `解决签到验证码失败 ${ typeof result === 'string' ? "\n" + result : "" }` );
}

export async function getSignInInfo( userId: number | string, uid: string, region: string, cookie: string ): Promise<ResponseBody<ApiType.SignInInfo>> {
	const query = {
		act_id: activityID,
		region, uid
	};
	
	const { data: result } = await $https.FETCH_SIGN_INFO.get( query, {
		headers: await getSignHeaders( userId, cookie, false )
	} );
	if ( !result.data ) {
		throw new Error( result.message );
	}
	return toCamelCase( result );
}

/* 验证码相关解决方案 */
export async function bypassQueryVerification( cookie: string, gt?: string, challenge?: string ): Promise<string> {
	const data = {
		gt: gt ? gt : '',
		challenge: challenge ? challenge : ''
	};
	if ( !gt || !challenge ) {
		//获取验证码
		const { data: createVerify } = await $https.FETCH_CREATE_VERIFICATION.get( { is_high: "true" }, {
			headers: getCommonHeaders( cookie, getDS( { is_high: true } ) )
		} );
		if ( !createVerify.data ) {
			bot.logger.error( "[genshin][create]", createVerify );
			return "[create] 获取验证码失败";
		}
		data.gt = createVerify.data.gt;
		data.challenge = createVerify.data.challenge;
	}
	//提交GEETEST
	await randomSleep( 3, 5, true );
	await $https.FETCH_GEETEST.get( {
		gt: data.gt,
		challenge: data.challenge
	} );
	//验证验证码
	const { data: analysisCode } = await $https.FETCH_GET_VERIFY.get( {
		token: config.verify.token,
		gt: data.gt,
		challenge: data.challenge
	}, {
		headers: {
			"User-Agent": "Adachi-BOT"
		}
	} );
	if ( analysisCode.code !== 0 || analysisCode.info !== "success" ) {
		bot.logger.error( "[genshin][verify]", analysisCode );
		return `[verify] 验证失败 ${ typeof analysisCode === 'string' ? "\n" + analysisCode : analysisCode.info }`;
	}
	const body = {
		geetest_challenge: analysisCode.data.challenge,
		geetest_validate: analysisCode.data.validate,
		geetest_seccode: `${ analysisCode.data.validate }|jordan`
	}
	const { data: verifyResult } = await $https.FETCH_VERIFY_VERIFICATION.post( body, {
		headers: getCommonHeaders( cookie, getDS( undefined, JSON.stringify( body ) ) )
	} );
	/* 验证码过期 */
	if ( verifyResult.retcode !== 0 || verifyResult.message !== 'OK' ) {
		bot.logger.error( "[genshin][submit]", verifyResult );
		return `[submit] 验证失败 ${ typeof verifyResult === 'string' ? "\n" + verifyResult : verifyResult.message }`;
	}
	return "";
}

export async function mihoyoBBSVerifySignIn( userId: number | string, uid: string, region: string, cookie: string, gt: string, challenge: string ): Promise<ResponseBody<ApiType.SignInResult>> {
	const body = {
		act_id: activityID,
		uid, region
	};
	
	const { data: verifyCode } = await $https.FETCH_GET_VERIFY.get( {
		token: config.verify.token,
		gt: gt,
		challenge: challenge
	}, {
		headers: {
			"User-Agent": "Adachi-BOT"
		}
	} );
	
	if ( verifyCode.code !== 0 || verifyCode.info !== "success" ) {
		bot.logger.error( "[genshin][verify]" + JSON.stringify( verifyCode ) );
		throw `[verify] 验证失败 ${ typeof verifyCode === 'string' ? "\n" + verifyCode : verifyCode.info }`;
	}
	
	const { data: result } = await $https.FETCH_SIGN_IN.post( body, {
		headers: {
			...await getSignHeaders( userId, cookie ),
			"x-rpc-challenge": verifyCode.data.challenge,
			"x-rpc-validate": verifyCode.data.validate,
			"x-rpc-seccode": `${ verifyCode.data.validate }|jordan`
		}
	} );
	
	const resp: ResponseBody<ApiType.SignInResult> = toCamelCase( result );
	if ( !resp.data.gt && resp.data.success === 0 ) {
		return resp;
	}
	//遇到验证码
	throw `解决签到验证码失败 ${ typeof result === 'string' ? "\n" + result : "" }`;
}

/* Token转换相关API */
export async function getCookieAccountInfoBySToken(
	stoken: string,
	mid: string,
	uid: string ): Promise<ResponseBody<ApiType.CookieToken>> {
	const param = {
		stoken: stoken,
		mid: mid,
		token_types: 3,
		uid: uid
	}
	
	const { data: result } = await $https.FETCH_GET_COOKIE_TOKEN.get( param );
	
	if ( !result.data ) {
		throw result.message;
	}
	
	return toCamelCase( result );
}

export async function getMultiTokenByLoginTicket( uid: number, loginTicket: string, cookie: string ): Promise<ResponseBody<ApiType.MutiTokenResult>> {
	const params = {
		login_ticket: loginTicket,
		token_types: 3,
		uid: uid
	};
	
	const deviceName = getRandomString( 5 );
	const { data: result } = await $https.FETCH_GET_MULTI_TOKEN.get( params, {
		headers: {
			"host": "api-takumi.mihoyo.com",
			"x-rpc-app_version": "2.28.1",
			"x-rpc-channel": "mihoyo",
			"x-rpc-client_type": "2",
			"x-rpc-device_id": guid(),
			"x-rpc-device_model": deviceName,
			"x-rpc-device_name": "Samsung " + deviceName,
			"x-rpc-sys_version": "12",
			"origin": "https://webstatic.mihoyo.com",
			"referer": "https://webstatic.mihoyo.com/",
			"user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) miHoYoBBS/2.28.1",
			"x-requested-with": "com.mihoyo.hyperion",
			"ds": generateDS(),
			"cookie": cookie
		},
		timeout: 5000
	} );
	
	if ( !result.data ) {
		throw result.message;
	}
	
	return toCamelCase( result );
}

export async function verifyLtoken( ltoken: string, ltuid: string ): Promise<ResponseBody<ApiType.VerifyLtoken>> {
	const params = {
		t: Date.now()
	};
	const cookie = `ltoken=${ ltoken }; ltuid=${ ltuid };`;
	const { data: result } = await $https.FETCH_VERIFY_LTOKEN.post( params, {
		headers: {
			...getCommonHeaders( cookie ),
			Referer: "https://bbs.mihoyo.com/"
		},
		timeout: 5000
	} );
	if ( !result.data ) {
		throw result.message;
	}
	return toCamelCase( result );
}


export async function getLTokenBySToken( stoken: string, mid: string ): Promise<ResponseBody<ApiType.GetLtoken>> {
	const cookie = `stoken=${ stoken }; mid=${ mid };`;
	
	const { data: result } = await $https.FETCH_GET_LTOKEN_BY_STOKEN.get( {}, {
		headers: getCommonHeaders( cookie, getDS( undefined, undefined ) ),
		timeout: 5000
	} );
	if ( !result.data ) {
		throw result.message;
	}
	return toCamelCase( result );
	
}

// 获取设备信息
export async function getDeviceFp( userId: string | number, cookie: string ): Promise<IFpData> {
	const device = await bot.redis.getHash( `adachi.miHoYo.${ Md5.init( userId ) }` );
	if ( device.deviceId && device.deviceFp ) {
		return { device_id: device.deviceId, device_fp: device.deviceFp };
	}
	
	const fpKey = `adachi.device-fp-${ userId }`;
	
	const deviceData: IDeviceData = await bot.redis.getHash( `adachi.device-info-${ userId }` );
	const fpData = await bot.redis.getHash( fpKey );
	
	// 是否存在绑定信息
	const hasDeviceData = Object.keys( deviceData ).length > 0;
	// 当存在绑定信息时，若存储的设备信息为手动绑定时直接返回，否则若为随机生成的则重新获取
	if ( fpData.bind === "true" || ( !hasDeviceData && fpData.bind === "false" ) ) {
		return { device_id: fpData.device_id, device_fp: fpData.device_fp };
	}
	
	const deviceReqBody = getDeviceRequestBody( hasDeviceData ? deviceData : undefined );
	const commonHeaders = getCommonHeaders( cookie )
	const { data: response } = await $https.FETCH_GET_DEVICE_FP.post( deviceReqBody, {
		headers: commonHeaders
	} )
	
	if ( response.retcode !== 0 ) {
		return Promise.reject( response.message );
	}
	
	if ( response.data.code !== 200 ) {
		return Promise.reject( response.data.msg );
	}
	
	const deviceId = deviceReqBody.device_id;
	const deviceFp = response.data.device_fp;
	const data = {
		device_id: deviceId,
		device_fp: deviceFp,
		bind: hasDeviceData ? "true" : "false"
	};
	await bot.redis.setHash( fpKey, data );
	await bot.redis.setTimeout( fpKey, 60 * 60 * 24 * 7 );
	
	// 若为新绑定设备，继续
	if ( hasDeviceData ) {
		const deviceBrand = deviceData.deviceFingerprint?.split( "/" )?.[0];
		const saveParams = {
			app_version: '2.73.1',
			device_id: `${ deviceId }`,
			device_name: `${ deviceBrand }${ deviceData.deviceModel }`,
			os_version: '33',
			platform: 'Android',
			registration_id: getMiHoYoRandomStr( 19 )
		}
		const saveHeaders = { ...commonHeaders, "x-rpc-device_fp": deviceFp }
		bot.logger.debug( "[genshin][获取device_fp]保存登陆设备信息" );
		try {
			const { data: deviceLogin } = await $https.FETCH_DEVICE_LOGIN.post( saveParams, { headers: saveHeaders } );
			const { data: saveDevice } = await $https.FETCH_SAVE_DEVICE.post( saveParams, { headers: saveHeaders } );
			bot.logger.debug( `[genshin][获取device_fp]设备登陆完成 ${ JSON.stringify( [ deviceLogin, saveDevice ] ) }` );
		} catch ( error ) {
			bot.logger.error( "[genshin][获取device_fp]存储米游社设备信息报错:", error );
		}
	}
	return { device_id: deviceId, device_fp: deviceFp };
}

/* enka */
export async function getCharaDetail( origin: string, uid: number ): Promise<ApiType.Panel.EnKa> {
	const { data } = await $https.FETCH_ENKA_CHARA_DETAIL.get(
		{},
		url => origin + url.replace( "$", uid.toString() ),
		{
			headers: {
				"User-Agent": "mari-plugin/1.0"
			}
		}
	);
	return data;
}