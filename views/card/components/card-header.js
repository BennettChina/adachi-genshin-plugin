const template = `<div class="header-base">
	<div class="card-avatar-box" :class="{ 'without-nickname': data.level === '0' }">
		<img
			:class="{ user: urlParams.appoint === 'empty' }"
			:src="defaultAvatar"
			alt="ERROR"
		/>
		<article>
			<p>{{ data.nickname }}</p>
			<p>UID: {{ data.uid }}</p>
		</article>
	</div>
	<div class="card-base-stats">
		<p v-for="(base, index) in infoList" :key="index">
			<label>{{ base.label }}</label>
			<span>{{ base.value }}</span>
		</p>
	</div>
	<div v-if="data.level !== '0'" class="card-level-box">
		<p class="card-adventure">{{ data.level }}级</p>
		<p class="card-world">世界等级{{ worldLevel }}</p>
	</div>
</div>`;

import { defineComponent, computed } from "vue";

export default defineComponent( {
	name: "CardHeader",
	template,
	props: {
		data: {
			type: Object,
			default: () => ( {} )
		},
		urlParams: {
			type: Object,
			default: () => ( {} )
		},
		infoList: {
			type: Array,
			default: () => []
		}
	},
	setup( props ) {
		const appoint = props.urlParams.appoint;
		const profile = props.urlParams.profile;
		
		const avatars = props.data.avatars;
		const level = props.data.level;
		const charNum = avatars.length;
		
		/* 获取头像 */
		function getProImg( name ) {
			return `/genshin/adachi-assets/character/${ name }/image/face.png`;
		}
		
		const defaultAvatar = computed( () => {
			return appoint === "empty"
				? profile === "random"
					? getProImg( avatars[Math.floor( Math.random() * charNum )].name )
					: `https://q1.qlogo.cn/g?b=qq&s=640&nk=${ props.urlParams.qq }`
				: getProImg( appoint );
		} );
		
		/* 计算世界等级 */
		const worldLevel = computed( () => {
			if ( parseInt( level ) < 20 ) {
				return 0;
			}
			if ( parseInt( level ) === 60 ) {
				return 8;
			}
			return Math.floor( ( parseInt( level ) - 15 ) / 5 );
		} );
		
		return {
			defaultAvatar,
			worldLevel
		};
	}
} );
