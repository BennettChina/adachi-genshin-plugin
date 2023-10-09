const template = `<div class="floor">
	<header class="floor-title">第{{ data.index }}层</header>
	<section class="floor-room-list">
		<Room v-for="(l, lKey) of levels" :key="lKey" :data="l"></Room>
	</section>
</div>`;

import Room from "./room.js"
import { defineComponent } from "vue";

export default defineComponent( {
	name: "Floor",
	components: {
		Room
	},
	props: {
		data: {
			type: Object,
			default: () => ( {
				index: 0,
				levels: []
			} )
		}
	},
	template,
	setup( props ) {
		/* 获取三间数据，无数据使用默认数据填充 */
		const levels = Array.from( { length: 3 } ).map( ( fake, lKey ) => {
			const index = lKey + 1;
			const level = props.data.levels?.find( f => f.index === index );
			return level || {
				index,
				battles: []
			}
		} );
		
		return {
			levels
		}
	}
} )