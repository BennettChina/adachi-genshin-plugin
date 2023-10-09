import { defineDirective } from "@/modules/command";
import { Private } from "#/genshin/module/private/main";
import { RenderResult } from "@/modules/renderer";
import { CharacterInformation, EffectsShirt, EvaluateScore, ScoreItem, Skills } from "#/genshin/types";
import { getRealName, NameResult } from "#/genshin/utils/name";
import { mysAvatarDetailInfoPromise, mysInfoPromise } from "#/genshin/utils/promise";
import { getPrivateAccount } from "#/genshin/utils/private";
import { characterMap, config, renderer, typeData } from "#/genshin/init";

function evaluate( obj: { rarity: number; level: number }, max: number = 5 ): number {
	return ( obj.rarity / max ) * obj.level;
}

export default defineDirective( "order", async ( { sendMessage, messageData, matchResult, auth, redis, logger } ) => {
	const { user_id: userID } = messageData;
	
	const [ idMsg, name ] = matchResult.match;
	
	const info: Private | string = await getPrivateAccount( userID, idMsg, auth );
	if ( typeof info === "string" ) {
		await sendMessage( info );
		return;
	}
	
	const { cookie, mysID, uid, server } = info.setting;
	const result: NameResult = getRealName( name );
	
	if ( !result.definite ) {
		const message: string = result.info.length === 0
			? "查询失败，请检查角色名称是否正确"
			: `未找到相关信息，是否要找：${ [ "", ...<string[]>result.info ].join( "\n  - " ) }`;
		await sendMessage( message );
		return;
	}
	const realName: string = <string>result.info;
	const charID: number = characterMap.map[realName].id;
	
	try {
		await mysInfoPromise( userID, mysID, cookie );
	} catch ( error ) {
		if ( error !== "gotten" ) {
			await sendMessage( <string>error );
			return;
		}
	}
	
	const { avatars } = await redis.getHash( `silvery-star.card-data-${ uid }` );
	const data: CharacterInformation[] = JSON.parse( avatars );
	const charInfo = data.find( ( { id } ) => {
		return charID === -1 ? id === 10000005 || id === 10000007 : id === charID;
	} );
	
	if ( !charInfo ) {
		await sendMessage( `[UID-${ uid }] 未拥有角色 ${ realName }` );
		return;
	}
	try {
		const dbKey: string = `silvery-star.character-temp-${ userID }`;
		const skills: Skills = await mysAvatarDetailInfoPromise(
			uid, charInfo.id, server, cookie, charInfo.constellations
		);
		
		const coefficients: number[] = [ 20, 15, 30, 35 ];
		const list: ScoreItem[] = [ {
			label: "圣遗物",
			percentage: charInfo.artifacts.reduce( ( pre, cur ) => pre + evaluate( cur ), 0 ) / 100
		}, {
			label: "武器等级",
			percentage: evaluate( charInfo.weapon ) / 90
		}, {
			label: "角色等级",
			percentage: charInfo.level / 90
		}, {
			label: "天赋升级",
			percentage: Math.min(
				skills.reduce(
					( pre, cur ) => pre + cur.levelCurrent, 0 ), 24
			) / 24
		} ];
		
		const effects: EffectsShirt[] = charInfo.effects.map( effect => {
			const [ name, num ] = effect.name.split( " " );
			const artifact = typeData.artifact.suits[name];
			return {
				name, num,
				icon: artifact
					? artifact.suit.length === 1
						? "4"
						: "0"
					: "0"
			}
		} )
		
		const score: EvaluateScore = {
			list,
			total: list.reduce( ( pre, cur, i ) => {
				return pre + cur.percentage * coefficients[i]
			}, 0 )
		};
		
		await redis.setString( dbKey, JSON.stringify( {
			...charInfo,
			effects,
			skills,
			score,
			uid
		} ) );
	} catch ( error ) {
		await sendMessage( <string>error );
		return;
	}
	
	const res: RenderResult = await renderer.asSegment(
		"/character", {
			qq: userID,
			showScore: config.showCharScore
		} );
	if ( res.code === "ok" ) {
		await sendMessage( res.data );
	} else {
		throw new Error( res.error );
	}
} );