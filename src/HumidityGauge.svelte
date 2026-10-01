<script lang="ts">
	export let value: number | null | undefined = null;

	$: humidity = typeof value === 'number' && Number.isFinite(value)
		? Math.max(0, Math.min(100, value))
		: null;
	$: roundedHumidity = humidity === null ? null : Math.round(humidity);
</script>

{#if humidity !== null}
	<div
		class="humidity-gauge"
		role="meter"
		aria-label="相对湿度"
		aria-valuemin="0"
		aria-valuemax="100"
		aria-valuenow={roundedHumidity}
		aria-valuetext={`相对湿度 ${roundedHumidity}%`}
	>
		<span class="humidity-gauge-scale" aria-hidden="true"></span>
		<i class="humidity-gauge-indicator" style={`left:${humidity}%`} aria-hidden="true"></i>
	</div>
{/if}

<style>
	.humidity-gauge { position: relative; height: 12px; margin: 2px 6px 1px; }
	.humidity-gauge-scale {
		position: absolute;
		inset: 4px 0;
		border-radius: 999px;
		background: linear-gradient(90deg, #e9d77d 0 40%, #a8d97c 40% 60%, #5bc4a1 60% 75%, #3cb6d0 75% 90%, #a88cff 90% 100%);
	}
	.humidity-gauge-indicator {
		position: absolute;
		top: 0;
		width: 12px;
		height: 12px;
		transform: translateX(-50%);
		border: 2px solid #f7f9ff;
		border-radius: 50%;
		background: #101729;
		box-shadow: 0 0 0 1px #101729;
	}
</style>
