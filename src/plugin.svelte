<svelte:window on:keydown={handleWindowKeydown} />
<div class="plugin-shell">
	<div class="plugin__mobile-header">高海拔天气剖面</div>
	<section class="plugin__content">
		<button type="button" class="plugin__title plugin__title--chevron-back back-button" on:click={closePlugin}>
			高海拔天气剖面
		</button>

		<div class="intro-row">
			<p class="eyebrow">山地天气 · 高空剖面</p>
			<span class="plugin-version" aria-label={`插件版本 ${config.version}`}>版本 {config.version}</span>
		</div>

		<div class="model-row" aria-label="预报模式和单位">
			<div class="control-group model-control-group" role="group" aria-label="预报模式">
				<span class="control-label">模式</span>
				<div class="segmented">
					<button class:active={selectedModel === 'ecmwf'} aria-pressed={selectedModel === 'ecmwf'} on:click={() => selectModel('ecmwf')}>ECMWF</button>
					<button class:active={selectedModel === 'icon'} aria-pressed={selectedModel === 'icon'} on:click={() => selectModel('icon')}>ICON</button>
				</div>
			</div>
			{#if selectionMode !== 'observation'}
			<div class="control-group unit-control-group" role="group" aria-label="单位制">
				<span class="control-label">单位</span>
				<div class="segmented compact">
					<button class:active={unitSystem === 'metric'} aria-pressed={unitSystem === 'metric'} on:click={() => changeUnitSystem('metric')}>公制</button>
					<button class:active={unitSystem === 'imperial'} aria-pressed={unitSystem === 'imperial'} on:click={() => changeUnitSystem('imperial')}>英制</button>
				</div>
			</div>
			{/if}
		</div>

		<div class="divider"></div>
		<div class="segmented" aria-label="分析方式">
			<button class:active={selectionMode === 'observation'} on:click={() => setSelectionMode('observation')}>观山</button>
			<button class:active={selectionMode === 'point'} on:click={() => setSelectionMode('point')}>单点</button>
			<button class:active={selectionMode === 'route'} on:click={() => setSelectionMode('route')}>路线</button>
		</div>
		<ObservationPanel bind:this={observationPanel} active={selectionMode === 'observation'} model={selectedModel} elevation={observationElevation} weather={observationWeather} on:map={drawObservationMap} on:model={event => selectModel(event.detail)}/>
		{#if selectionMode !== 'observation'}

		<div class="section-heading route-heading">
			<div>
				<p class="eyebrow">地图选点与路线</p>
				<h2>选点与地形剖面</h2>
			</div>
			<div class="segmented compact" aria-label="选点模式">
				<button class:active={selectionMode === 'point'} aria-pressed={selectionMode === 'point'} on:click={() => setSelectionMode('point')}>单点</button>
				<button class:active={selectionMode === 'route'} aria-pressed={selectionMode === 'route'} on:click={() => setSelectionMode('route')}>路线</button>
			</div>
		</div>
		<p class="section-copy">{selectionMode === 'point' ? '可在地图点选位置，也可从 Windy 地点菜单直接打开。' : '按顺序点击起点、转折点和终点；点名称可修改，路线按实地距离计算。'}</p>

		{#if selectionMode === 'point'}
			<div class="coordinate-import">
				<p class="coordinate-format-note">大陆奥维坐标：带 g，自动转换。境外坐标：不带 g，按原值查询。</p>
				<form class="coordinate-entry ovi-coordinate-entry" on:submit|preventDefault={useOviCoordinate}>
					<label>粘贴奥维坐标（经度,纬度）<input type="text" inputmode="text" autocomplete="off" bind:value={manualCoordinateText} placeholder="g102.07896,29.72998" aria-label="奥维坐标，国内带 g，境外不带 g，顺序为经度、纬度" /></label>
					<button type="submit" class="small-button locate-button">解析定位</button>
				</form>
				{#if coordinateError}<span class="point-error">{coordinateError}</span>{/if}
			</div>
			{#if selectedPoint}
			<div class="coordinate-card">
				<div><span class="tiny-label">分析地点</span><strong>{selectedPoint.name}</strong></div>
				<div class="coord-value">{selectedPoint.lat.toFixed(4)}° · {selectedPoint.lon.toFixed(4)}°</div>
				<div class="coordinate-provenance">{coordinateProvenance}</div>
				<div class="point-facts" aria-live="polite">
					<span>{pointElevationLoading ? '正在读取地形…' : pointElevationM === null ? '地形高度缺测' : `地形海拔 ${formatHeight(pointElevationM, 0, unitSystem)}`}</span>
					<span>{pointProfileLoading ? `正在读取 ${selectedModel.toUpperCase()} 天气…` : pointProfile?.ok ? pointProfile.hasVerticalLayers ? `0–9000 米内地形以上高度层 ${pointChartGroundLevels.length}/${pointChartModelLevels.length} 个` : 'Windy 仅返回近地面天气，未返回垂直层' : pointProfileError ? '天气读取失败' : '天气未读取'}</span>
				</div>
				{#if pointElevationError}<span class="point-error">{pointElevationError}</span>{/if}
			</div>
			<div class="weather-section">
				<div class="weather-section-heading"><div><p class="eyebrow">垂直天气剖面</p><h3>单点高空天气</h3></div><span class="data-source-tag">Windy · {selectedModel.toUpperCase()}</span></div>
				<p class="section-copy">选中地点后自动读取。高度使用 Windy 返回的位势高度；只在有效层之间插值，不向数据范围外推。</p>
				<div class="weather-actions">
					{#if pointProfileLoading}<span class="load-status" role="status">天气剖面读取中…</span><button class="text-button" on:click={cancelPointProfile}>取消读取</button>{:else}{#if pointElevationLoading}<span class="load-status" role="status">天气读取完成，地形读取中…</span>{:else}<button class="secondary-button" on:click={loadPointProfile}>{pointProfile?.ok ? '刷新天气' : '重新读取天气'}</button>{/if}{#if pointProfile || pointProfileError}<button class="secondary-button" on:click={copyPointDiagnosticSummary}>复制数据摘要</button>{/if}{/if}
				</div>
				{#if pointProfileSummaryCopyStatus}<p class="load-status" role="status">{pointProfileSummaryCopyStatus}</p>{/if}
				{#if pointProfileSummaryText}<div class="diagnostic-copy-fallback"><label for="diagnostic-summary-text">诊断摘要可在此手动复制</label><textarea id="diagnostic-summary-text" bind:this={pointProfileSummaryTextarea} readonly rows="8" value={pointProfileSummaryText} on:focus={(event) => event.currentTarget.select()} aria-label="可手动复制的数据诊断摘要"></textarea><button type="button" class="secondary-button" on:click={selectDiagnosticSummary}>选中摘要文字</button></div>{/if}
				{#if pointProfileError}<p class="inline-error" role="alert">{pointProfileError}</p>{/if}
				{#if pointProfile?.ok}
					{#if activePointFrame}
						<div class="point-summary-card">
				<div class="point-summary-copy"><strong>{formatForecastTime(effectiveForecastTimestampMs ?? Date.now())} · 请求 {selectedModel.toUpperCase()}</strong><span>{pointTerrainM === null ? '地形高度未知' : `${pointTerrainSource} ${formatHeight(pointTerrainM, 0, unitSystem)} 海拔`} · 垂直层 {pointGroundLevels.length} 层{activePointFrame.surfaceLevel ? ' · 近地面温度或风可用' : ''}</span><span>目标 {formatHeight(Number(targetAltitudeM), 0, unitSystem)} {'海拔'}：{targetHeightResult?.ok ? `${formatTemperature(targetHeightResult.temperatureC, 1, unitSystem)} · 湿度 ${formatValue(targetHeightResult.humidityPct, 0, '%')} · 风 ${formatWind(targetHeightResult.windSpeedMs, 1, unitSystem)}` : targetHeightResult?.reason === 'below-terrain' ? '低于地形' : '暂无包围该高度的有效层'}</span><span>0°C 温度层估算：{freezingLevelText(pointFreezingLevels)}</span>{#if activePointFrame.surfaceVisibilityM !== null}<span>Windy 地面能见度（模式直返）：{formatVisibility(activePointFrame.surfaceVisibilityM)}</span>{/if}<span>Windy 地面阵风：{activePointFrame.surfaceWindGustMs === null ? '未返回' : formatWind(activePointFrame.surfaceWindGustMs, 1, unitSystem)}（地面字段，不代表高空）</span></div>
							<button class="secondary-button viewer-open-button" on:click={(event) => openProfileViewer('point', event)}>全屏查看剖面</button>
						</div>
						{#if pointProfile.verticalDataNotice}<div class="profile-data-notice" role="status"><strong>{pointProfile.dataSource === 'windy-legacy-meteogram' ? '已读取 Windy 旧版兼容数据（官方标记弃用）' : '高空数据说明'}</strong><p>{pointProfile.verticalDataNotice}</p></div>{/if}
						{#if activePointFrame.timeAlignmentNotice}<div class="profile-data-notice" role="status"><strong>部分预报字段时次未对齐</strong><p>{activePointFrame.timeAlignmentNotice}</p></div>{/if}
					{/if}
				{:else if pointProfileLoading}<p class="inline-note" role="status">正在读取该点的垂直天气数据，结果将直接显示在这里。</p>{/if}
			</div>
			{:else}
			<div class="point-empty-state" role="status"><strong>选择一个分析地点</strong><p>粘贴奥维坐标后解析定位，或直接点击 Windy 地图。选中后会自动显示地形和高空天气。</p></div>
			{/if}
		{:else}
			<div class="route-toolbar">
				<span>{routePoints.length} 个路线点{routeDistanceM ? ` · ${formatDistance(routeDistanceM, 1, unitSystem)}` : ''}</span>
				<div>
					{#if routePoints.length > 0}<button class="text-button" on:click={undoRoutePoint}>撤销一点</button>{/if}
					{#if routePoints.length > 0}<button class="text-button danger-text" on:click={clearRoute}>清空</button>{/if}
				</div>
			</div>
			{#if routePoints.length}
				<ol class="waypoint-list">
					{#each routePoints as point, index (point.id)}
						<li><span class="waypoint-index">{index + 1}</span><input class="waypoint-name-input" type="text" maxlength="32" value={point.name} aria-label={`路线点 ${index + 1} 名称`} on:change={(event) => handleWaypointNameChange(point.id, event)} /><small><span>{point.lat.toFixed(5)}°, {point.lon.toFixed(5)}°</span><span>{routeWaypointTerrainLabel(point)}</span></small></li>
					{/each}
				</ol>
			{/if}
			{#if routePoints.length >= 2}
				<div class="analysis-count"><span>路线顺序点均保留 · 计划分析点 <strong>{analysisPoints.length}</strong></span><label class="sample-count-control">天气采样<select value={routeSamplingMode} on:change={handleRouteSamplingMode}><option value="spacing">按间距</option><option value="count">按点数</option></select></label></div>
				<div class="analysis-count">{#if routeSamplingMode === 'spacing'}<label class="sample-count-control">目标间距<select value={routeWeatherSpacingM} on:change={handleRouteWeatherSpacing}><option value={2000}>约 2 千米</option><option value={5000}>约 5 千米</option><option value={10000}>约 10 千米</option></select></label>{:else}<label class="sample-count-control">等距目标<input type="number" min="2" max="61" step="1" value={analysisCount} on:change={handleAnalysisCount} aria-label="等距分析目标点数" /></label>{/if}<span>等距网格间隔 {formatDistance(routeWeatherGridSpacingM, 1, unitSystem)}</span></div>
				<div class="route-summary-card">
					<div><span>路线距离</span><strong>{formatDistance(routeDistanceM, 1, unitSystem)}</strong></div>
					<div><span>地形数据</span><strong>{terrainSamples.filter(point => Number.isFinite(point.elevationM)).length} 个采样点</strong></div>
					<button class="secondary-button" disabled={terrainLoading} on:click={loadRouteTerrain}>{terrainLoading ? `读取地形 ${terrainProgress}/${terrainTotal}` : terrainSamples.length ? '刷新地形' : '读取路线地形'}</button>
					{#if terrainLoading}<button class="text-button" on:click={cancelTerrain}>取消</button>{/if}
				</div>
				<div class="weather-section route-weather-section">
					<div class="weather-section-heading"><div><p class="eyebrow">路线天气分析</p><h3>路线天气剖面</h3></div><span class="data-source-tag">请求 {selectedModel.toUpperCase()}</span></div>
					<p class="section-copy">默认沿线约每 5 千米读取天气，起点、转折点和终点均保留。等距网格最多 61 点；长路线会增大间距。加密采样耗时更长，不提高天气模型本身的分辨率。</p>
					<div class="weather-actions">
						<button class="secondary-button" disabled={routeWeatherLoading || routePoints.length < 2} on:click={loadRouteProfile}>{routeWeatherLoading ? `读取路线天气 ${routeWeatherProgress}/${analysisPoints.length}` : routeWeatherSamples.length ? '刷新路线天气' : '读取路线天气'}</button>
						{#if routeWeatherLoading}<button class="text-button" on:click={cancelRouteProfile}>取消</button>{/if}
					</div>
					{#if routeWeatherError}<p class="inline-error" role="alert">{routeWeatherError}</p>{/if}
					{#if routeWeatherSamples.length}
						<details class="route-diagnostic-details">
							<summary>逐点数据诊断（{routeWeatherSamples.length} 个点）</summary>
							<p>可复制每个分析点的字段形状和数据能力状态，摘要不含天气数值或坐标。</p>
							<button type="button" class="secondary-button" on:click={copyAllRouteDiagnosticSummaries}>复制全部点摘要</button>
							<ol>
								{#each routeWeatherSamples as sample (sample.key)}
									<li><div><strong>{sample.name} · 沿线 {formatDistance(sample.distanceM, 1, unitSystem)}</strong><span>{routeDiagnosticStatus(sample)}</span></div><button type="button" class="secondary-button" on:click={() => copyRouteDiagnosticSummary(sample)}>复制该点摘要</button></li>
								{/each}
							</ol>
							{#if routeDiagnosticSummaryCopyStatus}<p class="load-status" role="status">{routeDiagnosticSummaryCopyStatus}</p>{/if}
							{#if routeDiagnosticSummaryText}<div class="diagnostic-copy-fallback"><label for="route-diagnostic-summary-text">诊断摘要可在此手动复制</label><textarea id="route-diagnostic-summary-text" bind:this={routeDiagnosticSummaryTextarea} readonly rows="8" value={routeDiagnosticSummaryText} on:focus={(event) => event.currentTarget.select()} aria-label="可手动复制的路线点诊断摘要"></textarea><button type="button" class="secondary-button" on:click={selectRouteDiagnosticSummary}>选中摘要文字</button></div>{/if}
						</details>
					{/if}
					{#if routeWeatherTimesMs.length}
						<div class="route-summary-card route-weather-summary">
							<div><span>垂直数据</span><strong>{routeWeatherSamples.filter(sample => sample.profile?.hasVerticalLayers).length}/{routeWeatherSamples.length} 个点</strong></div>
							<div><span>预报时刻</span><strong>{formatForecastTime(effectiveForecastTimestampMs ?? Date.now())}</strong></div>
							<button class="secondary-button viewer-open-button" on:click={(event) => openProfileViewer('route', event)}>全屏查看路线剖面</button>
						</div>
					{/if}
				</div>
			{/if}
		{/if}

		{/if}
		<p class="footer-note">剖面按 Windy 实际返回的高度层绘制；缺测不外推。</p>
	</section>
	{#if profileViewer}
		<div bind:this={profileViewerElement} class="profile-viewer" role="dialog" aria-modal="true" aria-labelledby="viewer-title">
			<div class="viewer-page">
				<header class="viewer-header">
					<div><p class="viewer-kicker">高海拔天气剖面</p><h1 id="viewer-title">{profileViewer === 'point' ? '单点高空天气' : '路线天气剖面'}</h1><p>{profileViewer === 'point' ? `${selectedPoint?.name ?? '分析地点'} · ${selectedPoint?.lat.toFixed(4)}°，${selectedPoint?.lon.toFixed(4)}°` : `${routePoints.length} 个路线点 · ${formatDistance(routeDistanceM, 1, unitSystem)}`}</p></div>
					<button bind:this={profileViewerCloseButton} class="viewer-close" aria-label="关闭剖面" on:click={closeProfileViewer}>×</button>
				</header>
				<div class="viewer-timebar">
					<div><span>预报时刻</span><strong>{formatForecastTime(effectiveForecastTimestampMs ?? Date.now())} 北京时间</strong></div>
					<div class="viewer-time-controls">
						<label><span class="sr-only">选择预报时刻</span><select value={effectiveForecastTimestampMs ?? ''} on:change={handleForecastTimeChange}>{#each profileTimeOptions as timestamp (timestamp)}<option value={timestamp}>{formatForecastTime(timestamp)} 北京时间</option>{/each}</select></label>
						<div class="time-stepper"><button aria-label={`较早时刻 ${stepperText(-1)}`} disabled={profileTimeIndex <= 0} on:click={() => moveForecastTime(-1)}>{stepperText(-1)}</button><button aria-label={`较晚时刻 ${stepperText(1)}`} disabled={profileTimeIndex >= profileTimeOptions.length - 1} on:click={() => moveForecastTime(1)}>{stepperText(1)}</button></div>
						<div class="forecast-step-choice" aria-label="预报请求间隔"><span>请求间隔</span><button class:active={forecastStep === 1} aria-pressed={forecastStep === 1} on:click={() => changeForecastStep(1)}>1 小时</button><button class:active={forecastStep === 3} aria-pressed={forecastStep === 3} on:click={() => changeForecastStep(3)}>3 小时</button></div>
					</div>
				</div>
				<div class="viewer-provenance"><span>数据接口：{viewerProvenance.source}</span><span>模式：{viewerProvenance.model}</span><span>有效时间间隔：{precipitationIntervalLabel}</span><span>起报：{formatSourceTime(viewerSourceProfile?.referenceTime)}</span><span>更新：{formatSourceTime(viewerSourceProfile?.updateTime)}</span>{#if profileViewer === 'point' && activePointFrame?.timeAlignmentNotice}<span>时间轴说明：{activePointFrame.timeAlignmentNotice}</span>{/if}{#if profileViewer === 'point' && activePointFrame?.surfaceVisibilityM !== null && activePointFrame?.surfaceVisibilityM !== undefined}<span>地面能见度：{formatVisibility(activePointFrame.surfaceVisibilityM)}（不代表高空）</span>{/if}{#if profileViewer === 'point' && activePointFrame}<span>地面阵风：{activePointFrame.surfaceWindGustMs === null ? 'Windy 未返回' : formatWind(activePointFrame.surfaceWindGustMs, 1, unitSystem)}（不代表高空）</span>{/if}</div>
				<p class="viewer-empty-note">新版接口请求范围：{requestedForecastDays} 天；{profileTimeOptions.length ? `${profileViewer === 'route' ? '路线共同' : '当前点'}返回时次：${formatForecastTime(profileTimeOptions[0])} 至 ${formatForecastTime(profileTimeOptions[profileTimeOptions.length - 1])}（北京时间），共 ${profileTimeOptions.length} 个时次。` : '尚无可用时次。'} 实际范围受模型与账号权限限制，各高度的有效层仍可能缺测。</p>
				{#if profileViewer === 'point' && activePointFrame}
					<div class="viewer-stat-grid">
						<div><span>模式</span><strong>{selectedModel.toUpperCase()}</strong></div><div><span>当前模式层</span><strong>{pointGroundLevels.length}</strong></div><div><span>高度范围</span><strong>{pointGroundLevels.length ? `${formatHeight(pointCoverageMinM, 0, unitSystem)}–${formatHeight(pointCoverageMaxM, 0, unitSystem)}` : '无有效层'}</strong></div><div><span>查询高度</span><strong>{formatHeight(Number(targetAltitudeM), 0, unitSystem)} {'海拔'}</strong></div>
					</div>
					<div class="viewer-section-head"><div><p class="viewer-kicker">垂直变化</p><h2>高度剖面曲线</h2></div><span>横轴为海拔，纵轴为对应变量</span></div>
					<div class="viewer-target-control"><label>查询高度<input type="number" min={displayHeightNumber(0, 0, unitSystem)} max={displayHeightNumber(20_000, 0, unitSystem)} step={unitSystem === 'metric' ? 50 : 100} value={displayHeightNumber(Number(targetAltitudeM), 1, unitSystem)} on:change={handleTargetAltitudeChange} aria-label={`查询高度，${'海拔'}，${heightUnit(unitSystem)}`} />{heightUnit(unitSystem)}</label><span>{pointTerrainM === null ? '地形高度未知' : `${pointTerrainSource} ${formatHeight(pointTerrainM, 0, unitSystem)} 海拔`}{#if pointHasLevelsAboveChart} · 图框上方仍有有效层{/if}</span></div>
					<div class="terrain-override-control"><label>峰顶实际海拔<input type="number" min="0" max={displayHeightNumber(10_000, 0, unitSystem)} step="any" value={manualPeakElevationM === null ? '' : displayHeightNumber(manualPeakElevationM, 1, unitSystem)} on:change={handleManualPeakElevation} aria-label={`手动峰顶实际海拔，${heightUnit(unitSystem)}`} placeholder={pointTerrainM === null ? '可选' : displayHeightNumber(pointTerrainM, 0, unitSystem)} />{heightUnit(unitSystem)}</label><div class="terrain-override-actions"><button type="button" class="secondary-button" disabled={!Number.isFinite(pointTerrainM)} on:click={queryAtTerrainElevation}>查询该点地形高度</button>{#if manualPeakElevationM !== null}<button type="button" class="text-button" on:click={clearManualPeakElevation}>恢复 Windy 地形</button>{/if}</div><p>尖峰位置可填真实海拔，修正地形网格低估；单独影响地形过滤和入云判断，不会生成缺失天气值。</p>{#if manualPeakElevationError}<p class="inline-error" role="alert">{manualPeakElevationError}</p>{/if}</div>
					<div class="altitude-presets" aria-label="常用查询高度">{#each ([3000, 4000, 5000, 6000, 7000, 8000, 9000]) as preset (preset)}<button class:active={Number(targetAltitudeM) === preset} aria-pressed={Number(targetAltitudeM) === preset} on:click={() => targetAltitudeM = preset}>{displayHeightNumber(preset, 0, unitSystem)} {heightUnit(unitSystem)}</button>{/each}</div>
					<div class="target-result-grid"><div><span>温度</span><strong>{formatTemperature(targetHeightResult?.temperatureC, 1, unitSystem)}</strong><small>{methodLabel(targetHeightResult?.methods?.temperature)}</small></div><div><span>露点</span><strong>{formatTemperature(targetHeightResult?.dewPointC, 1, unitSystem)}</strong><small>{methodLabel(targetHeightResult?.methods?.dewPoint)}</small></div><div><span>相对湿度</span><strong>{formatValue(targetHeightResult?.humidityPct, 0, '%')}</strong><small>{methodLabel(targetHeightResult?.methods?.humidity)}</small></div><div><span>风速</span><strong>{formatWind(targetHeightResult?.windSpeedMs, 1, unitSystem)}</strong><small>{methodLabel(targetHeightResult?.methods?.wind)}</small></div><div><span>风向</span><strong>{formatWindDirection(targetHeightResult?.windDirectionDeg)}</strong><small>{methodLabel(targetHeightResult?.methods?.wind)}</small></div><div class="target-visibility-unavailable"><span>目标高度能见度</span><strong>未提供</strong><small>地面能见度不代替高空</small></div></div>
					<details class="multiple-altitude-details">
						<summary>同时查询多个任意高度{multiAltitudeHeightsM.length ? `（${multiAltitudeHeightsM.length} 项）` : ''}</summary>
						<p>用逗号、顿号、分号或空格分隔，单位按当前选择的公制或英制填写；也可在数值后写 m、米、ft 或英尺。最多 200 项，输入顺序和重复项都会保留。</p>
						<div class="multi-altitude-input-row"><label>高度列表（{'海拔'}，{heightUnit(unitSystem)}）<input type="text" inputmode="decimal" value={multiAltitudeInput} on:change={handleMultiAltitudeInput} placeholder={unitSystem === 'metric' ? '3666, 4900' : '12028, 16076'} aria-label={`多个查询高度，${'海拔'}，${heightUnit(unitSystem)}`} /></label><button type="button" class="secondary-button" disabled={!multiAltitudeInput} on:click={clearMultiAltitudeInput}>清空</button></div>
						{#if multiAltitudeInputError}<p class="viewer-inline-error" role="alert">{multiAltitudeInputError}</p>{:else if multiAltitudeRows.length}<div class="viewer-table-wrap"><table class="viewer-table multi-altitude-table"><thead><tr><th>输入高度</th><th>温度</th><th>相对湿度</th><th>风速</th><th>风向</th><th>云量</th></tr></thead><tbody>{#each multiAltitudeRows as row, index (`multi-altitude-${index}-${row.heightM}`)}<tr><td>{formatHeight(row.heightM, 0, unitSystem)}<small>{'海拔'} · {row.values?.reason === 'below-terrain' ? '低于地形' : row.values?.ok ? '有效' : '缺测'}</small></td><td>{formatTemperature(row.values?.temperatureC, 1, unitSystem)}<small>{methodLabel(row.values?.methods?.temperature)}</small></td><td>{formatValue(row.values?.humidityPct, 0, '%')}<small>{methodLabel(row.values?.methods?.humidity)}</small></td><td>{formatWind(row.values?.windSpeedMs, 1, unitSystem)}<small>{methodLabel(row.values?.methods?.wind)}</small></td><td>{formatWindDirection(row.values?.windDirectionDeg)}</td><td>{formatValue(row.values?.cloudPct, 0, '%')}<small>{methodLabel(row.values?.methods?.cloud)}</small></td></tr>{/each}</tbody></table></div>{:else}<p class="viewer-empty-note">输入两个或更多高度，可一次对照温度、湿度、风和云量。</p>{/if}
					</details>
					{#if !targetHeightResult?.ok}<div class="query-data-status" role="status"><strong>{targetHeightResult?.reason === 'below-terrain' ? `查询海拔低于地形 ${formatHeight(Number(pointTerrainM), 0, unitSystem)}` : 'Windy 未返回能包围该查询海拔的有效高度层'}</strong><span>{targetHeightResult?.reason === 'below-terrain' ? '该查询值无效；灰色虚线只是地形以下的模式原始层，不纳入这里的天气结果。' : '当前高度没有直接值，也没有相邻有效模式层可插值。'}</span>{#if pointNearestUsableLevel}<button type="button" class="secondary-button" on:click={queryAtNearestProfileLevel}>查看最近有效层 {formatHeight(pointNearestUsableLevel.heightM, 0, unitSystem)}</button>{/if}</div>{/if}
					<div class="cloud-assessment-wrap"><p class={`cloud-assessment cloud-assessment--${pointCloudAssessment.kind}`}>{pointCloudAssessment.text}</p><p class="cloud-direct-target">该高度附近模式层云量：{formatValue(targetHeightResult?.cloudPct, 0, '%')} · {methodLabel(targetHeightResult?.methods?.cloud)}</p>{#if pointHasGroupedClouds}<div class="cloud-layer-summary"><strong>Windy 分层云量概览</strong><span>低云 {formatValue(activePointFrame.lowCloudPct, 0, '%')}</span><span>中云 {formatValue(activePointFrame.mediumCloudPct, 0, '%')}</span><span>高云 {formatValue(activePointFrame.highCloudPct, 0, '%')}</span></div>{/if}</div>
					<p class="freezing-level-note" role="status">0°C 温度层估算：{freezingLevelText(pointFreezingLevels)}。只在相邻有效模式温度层间线性插值，不跨缺测，也不外推。</p>
					{#if pointPotentialIcingLevels.length}<div class="condition-cue"><strong>零下云层信号：{pointPotentialIcingLevels.length} 个模式层</strong><p>这些层同时满足温度不高于 0°C 和云量或高湿信号，只提示可能存在结冰条件，不表示一定结冰，也不估算强度。</p>{#each pointPotentialIcingLevels as level (`icing-${level.pressureHPa}-${level.heightM}`)}<span>{formatHeight(level.heightM, 0, unitSystem)} · {formatTemperature(level.temperatureC, 1, unitSystem)} · {level.cloudSignal === 'direct-cloud' ? `模式云量 ${formatValue(level.cloudPct, 0, '%')}` : `湿度推算信号 ${formatValue(level.relativeHumidityPct, 0, '%')}`}</span>{/each}</div>{/if}
					<p class="trend-interaction-hint">拖动图表选海拔；点按彩色数据点读取该模式层，四图同步。近地面温度和风按模式地形高度定位。彩色实线为地形以上有效天气，灰色虚线为地形以下模式原始值，不代表地下实况。</p>
					{#if pointTrendStatus}<div class="profile-coverage-notice" role="status"><strong>地形以上的有效层不足以形成连续趋势</strong><p>{pointTrendStatus} 图中灰色虚线和下方“仅模式参考”行保留了 Windy 的地下模式层原值；这些数值不代表地形处真实空气天气。</p></div>{/if}
					<div class="trend-grid" use:observeTrendWidth>
						{#each pointTrendCharts as metric (metric.field)}
							{@const geometry = metric.geometry}
							<div class="trend-panel">
								<div class="trend-panel-heading"><h3>{metric.title} <small>{trendUnit(metric.field, unitSystem)}</small></h3><span>{trendCoverageSummary(geometry, metric.field, metric.digits)}</span></div>
								{#if geometry}
									{@const hasTrendLine = geometry.segments.some(segment => segment.length >= 2)}
									{@const requestedAltitude = pointTargetAltitudeMsl ?? Number.NaN}
									{@const targetAltitudeInChart = Number.isFinite(requestedAltitude) && requestedAltitude >= 0 && requestedAltitude <= geometry.maxHeightM}
									{@const boundedAltitude = Math.max(0, Math.min(geometry.maxHeightM, Number.isFinite(requestedAltitude) ? requestedAltitude : 0))}
									{@const targetX = geometry.x(boundedAltitude)}
									{@const targetLabelX = Math.min(geometry.plot.right - 210, Math.max(geometry.plot.left + 4, targetX - 100))}
									{@const targetValue = targetAltitudeInChart ? altitudeTrendValueAt(geometry, boundedAltitude) : null}
									{@const targetY = targetValue === null ? null : geometry.y(targetValue)}
									{@const valueLabelX = Math.min(geometry.plot.right - 144, Math.max(geometry.plot.left + 4, targetX + 8))}
									{@const valueLabelY = targetY === null ? geometry.plot.top + 35 : Math.max(geometry.plot.top + 4, Math.min(geometry.plot.bottom - 25, targetY - 28))}
									{@const sliderValue = Math.round(boundedAltitude / 50) * 50}
										{@const terrainInChart = Number.isFinite(pointTerrainM) && pointTerrainM >= 0 && pointTerrainM <= geometry.maxHeightM}
										{@const terrainX = geometry.x(terrainInChart ? Number(pointTerrainM) : 0)}
										{@const terrainLabelOnLeft = terrainX > geometry.plot.right - 112}
									{#if !hasTrendLine}<p class="trend-data-note trend-data-note--top">{geometry.points.length === 0 ? `0–${displayHeightNumber(9_000, 0, unitSystem)} ${heightUnit(unitSystem)}内没有地形以上的有效${metric.title}层。灰色虚线仅显示地形以下模式原始层。` : geometry.points.length === 1 ? `地形以上仅有 1 个有效层（${formatHeight(geometry.points[0].heightM, 0, unitSystem)}），已标出原值；单层不能形成趋势线。` : geometry.hasRepeatedHeights ? '多组原始值落在相同海拔，不能形成垂直趋势线；下方列出各层实际值。' : `地形以上有 ${geometry.points.length} 个有效点，但点之间存在缺测或模式层断档，不能可靠连线。`}</p>{/if}
										{#if geometry.isolatedPoints.length}<div class="trend-observed-points" aria-label={`${metric.title}的 Windy 原始数据点`}>{#each geometry.isolatedPoints as point (`observed-${metric.field}-${point.heightM}-${point.value}`)}<span class="trend-observed-point" style={`--trend-color:${metric.color}`}><strong>{formatHeight(point.heightM, 0, unitSystem)}</strong><b>{formatTrendValue(point.value, metric.field, metric.digits, unitSystem)}</b><small>{point.source === 'model-surface' ? '模式地形近地面值' : `${point.pressureHPa} 百帕模式层`}</small></span>{/each}</div>{/if}
										<svg viewBox={`0 0 ${trendChartWidth} 320`} preserveAspectRatio="none" role="group" aria-label={`${metric.title}随海拔变化图`}>
										{#if geometry.belowTerrainPointCount > 0 && terrainInChart}<defs><clipPath id={`below-terrain-${metric.field}`}><rect x={geometry.plot.left} y={geometry.plot.top} width={Math.max(0, terrainX - geometry.plot.left)} height={geometry.plot.bottom - geometry.plot.top}/></clipPath></defs>{/if}
										{#if terrainInChart && terrainX > geometry.plot.left}<rect x={geometry.plot.left} y={geometry.plot.top} width={terrainX - geometry.plot.left} height={geometry.plot.bottom - geometry.plot.top} class="viewer-below-terrain-area"/>{/if}
										{#each geometry.valueTicks as tick (tick)}<line x1={geometry.plot.left} x2={geometry.plot.right} y1={geometry.y(tick)} y2={geometry.y(tick)} class="viewer-grid-line"/><text x="8" y={geometry.y(tick) + 5} class="viewer-axis-label">{formatTrendValue(tick, metric.field, metric.digits, unitSystem)}</text>{/each}
						{#each geometry.altitudeTicks as tick (tick)}<line x1={geometry.x(tick)} x2={geometry.x(tick)} y1={geometry.plot.top} y2={geometry.plot.bottom} class="viewer-grid-line viewer-grid-vertical"/><text x={geometry.x(tick)} y="307" text-anchor={tick === 0 ? 'start' : tick === geometry.maxHeightM ? 'end' : 'middle'} class="viewer-axis-label">{displayHeightNumber(tick, 0, unitSystem)} {heightUnit(unitSystem)}</text>{/each}
										{#if geometry.referencePath && geometry.belowTerrainPointCount > 0 && terrainInChart && terrainX > geometry.plot.left}<path d={geometry.referencePath} class="trend-line trend-line--reference" clip-path={`url(#below-terrain-${metric.field})`} style={`--trend-color:${metric.color}`}/>{/if}
						{#if geometry.path}<path d={geometry.path} class="trend-line" style={`--trend-color:${metric.color};stroke:${metric.color};stroke-width:4px;fill:none`}/>{/if}
										{#each geometry.referencePoints.filter(point => point.belowTerrain) as point (`reference-${point.heightM}-${point.value}`)}<circle cx={point.x} cy={point.y} r="3.8" class="trend-reference-dot"><title>{formatHeight(point.heightM, 0, unitSystem)} · {formatTrendValue(point.value, metric.field, metric.digits, unitSystem)} · {point.source === 'model-surface' ? '模式地形近地面值，低于实际地形，仅供参考' : '地形以下模式原始层，仅供参考'}</title></circle>{/each}
						{#each geometry.points as point (`${point.heightM}-${point.value}`)}{@const pointLabelX = point.x > geometry.plot.right - 190 ? point.x - 184 : point.x + 10}{@const pointLabelY = point.y < geometry.plot.top + 28 ? point.y + 24 : point.y - 9}<circle cx={point.x} cy={point.y} r="6" class="trend-dot" style={`--trend-color:${metric.color}`}><title>{formatHeight(point.heightM, 0, unitSystem)} · {formatTrendValue(point.value, metric.field, metric.digits, unitSystem)} · {point.source === 'model-surface' ? '模式地形近地面值' : `${point.pressureHPa} 百帕模式层`}</title></circle>{#if !hasTrendLine || geometry.segments.some(segment => segment.length === 1 && segment[0] === point)}<text x={pointLabelX} y={pointLabelY} class="trend-point-value" style={`--trend-color:${metric.color}`}>{formatHeight(point.heightM, 0, unitSystem)} · {formatTrendValue(point.value, metric.field, metric.digits, unitSystem)}</text>{/if}{/each}
										{#if terrainInChart}<line x1={terrainX} x2={terrainX} y1={geometry.plot.top} y2={geometry.plot.bottom} class="viewer-terrain-line"/><text x={terrainLabelOnLeft ? terrainX - 5 : terrainX + 5} y={geometry.plot.bottom - 8} text-anchor={terrainLabelOnLeft ? 'end' : 'start'} class="viewer-terrain-label">地形 {formatHeight(Number(pointTerrainM), 0, unitSystem)}</text>{#if terrainX - geometry.plot.left > 88}<text x={(terrainX + geometry.plot.left) / 2} y={geometry.plot.top + 18} text-anchor="middle" class="viewer-below-terrain-label">地形以下</text>{/if}{/if}
										{#if targetAltitudeInChart}<line x1={targetX} x2={targetX} y1={geometry.plot.top} y2={geometry.plot.bottom} class="viewer-target-line"/><rect x={targetLabelX} y="7" width="210" height="23" rx="4" class="viewer-target-tag"/><text x={targetLabelX + 8} y="23" class="viewer-target-label">查询点 {formatHeight(boundedAltitude, 0, unitSystem)} 海拔</text>{#if targetY !== null}<line x1={geometry.plot.left} x2={geometry.plot.right} y1={targetY} y2={targetY} class="viewer-target-value-line"/><circle cx={targetX} cy={targetY} r="6" class="viewer-query-dot" style={`--trend-color:${metric.color}`}/>{/if}<rect x={valueLabelX} y={valueLabelY} width="140" height="23" rx="4" class="viewer-query-value-tag"/><text x={valueLabelX + 7} y={valueLabelY + 16} class="viewer-query-value-label">查询值 {targetValue === null ? Number.isFinite(pointTerrainM) && boundedAltitude < pointTerrainM ? '地形以下' : '该高度缺测' : formatTrendValue(targetValue, metric.field, metric.digits, unitSystem)}</text>{/if}
											<rect x={geometry.plot.left} y={geometry.plot.top} width={geometry.plot.right - geometry.plot.left} height={geometry.plot.bottom - geometry.plot.top} class="trend-altitude-slider" role="slider" tabindex="0" aria-label={`拖动选择查询海拔：${metric.title}`} aria-valuemin="0" aria-valuemax={geometry.maxHeightM} aria-valuenow={Math.min(geometry.maxHeightM, Math.max(0, sliderValue))} aria-valuetext={`${displayHeightNumber(sliderValue, 0, unitSystem)} ${heightUnit(unitSystem)} 海拔`} on:pointerdown={(event) => beginTrendDrag(event, geometry)} on:pointermove={(event) => moveTrendDrag(event, geometry)} on:pointerup={endTrendDrag} on:pointercancel={endTrendDrag} on:keydown={(event) => handleTrendSliderKeydown(event, geometry.maxHeightM)}><title>点按或拖动选择查询海拔</title></rect>
											{#each geometry.points as point (`select-${point.heightM}-${point.value}`)}<circle cx={point.x} cy={point.y} r="12" class="trend-point-hit" role="button" tabindex="0" aria-label={`查询 ${formatHeight(point.heightM, 0, unitSystem)}高度，${metric.title} ${formatTrendValue(point.value, metric.field, metric.digits, unitSystem)}`} on:pointerdown|stopPropagation on:click|stopPropagation={() => selectTrendPoint(point.heightM)} on:keydown|stopPropagation={(event) => handleTrendPointKeydown(event, point.heightM)}><title>{point.source === 'model-surface' ? '模式地形近地面值' : '模式层原值'} · 点按查看该高度</title></circle>{/each}
										</svg>

									{:else}<p class="viewer-empty-chart">当前变量剖面图不可用。</p>{/if}
							</div>
						{/each}
					</div>
					<div class="viewer-cloud-section">
						<div class="viewer-section-head"><div><p class="viewer-kicker">云层信息</p><h2>模式云带与高湿可能云区</h2></div><span>逐层云量来自 Windy；云带边界为层间估算</span></div>
						<p class="cloud-direct-base">Windy 直接云底：{activePointFrame.cloudBaseM === null ? '未返回' : `${formatHeight(activePointFrame.cloudBaseM, 0, unitSystem)}`} · 直接云顶字段：未返回 · 直接云厚度字段：未返回</p>
						{#if pointGroundLevels.some(level => Number.isFinite(level.cloudPct))}
							<div class="cloud-level-list">{#each pointGroundLevels.filter(level => Number.isFinite(level.cloudPct)) as level (`cloud-${level.pressureHPa}-${level.heightM}`)}<div><span>{formatHeight(level.heightM, 0, unitSystem)}<small>{level.pressureHPa} 百帕</small></span><div class="cloud-level-track"><i style={`width:${Math.max(0, Math.min(100, level.cloudPct ?? 0))}%;background:${cloudColor(level.cloudPct)}`}></i></div><strong>{Math.round(level.cloudPct ?? 0)}%</strong></div>{/each}</div>
						{:else}<p class="viewer-empty-note">当前模式没有返回逐层云量字段，不能据此判断云底、云顶或云厚度。</p>{/if}
						{#if pointDirectCloudBands.length}<div class="possible-cloud-list direct-cloud-list"><strong>逐层云量识别到的模式云带</strong>{#each pointDirectCloudBands as band (`direct-cloud-${band.lowHeightM}-${band.highHeightM}`)}<div><span>{band.lowerBoundaryKnown ? formatHeight(band.lowHeightM, 0, unitSystem) : '低边界未确定'}–{band.upperBoundaryKnown ? formatHeight(band.highHeightM, 0, unitSystem) : '高边界未确定'}</span><small>最高逐层云量 {formatValue(band.peakCloudPct, 0, '%')} · {band.thicknessM === null ? '边界不完整，不能估算厚度' : `层界估算厚度约 ${formatHeight(band.thicknessM, 0, unitSystem)}`} · 上下界按相邻清空层与有云层的中点估算，不是直接观测</small></div>{/each}</div>{:else if pointGroundLevels.some(level => Number.isFinite(level.cloudPct))}<p class="viewer-empty-note">当前地形以上未识别到非零模式云带；这不代表实况无云。</p>{/if}
						{#if pointHumidityBands.length}
							<div class="possible-cloud-list"><strong>湿度推算的可能云区（相对湿度 ≥ 90%）</strong>{#each pointHumidityBands as band (`rh-${band.lowHeightM}-${band.highHeightM}`)}<div><span>{band.lowerBoundaryKnown ? formatHeight(band.lowHeightM, 0, unitSystem) : '低边界未确定'}–{band.upperBoundaryKnown ? formatHeight(band.highHeightM, 0, unitSystem) : '高边界未确定'}</span><small>{band.lowerBoundaryKnown && band.upperBoundaryKnown ? `可能云区估算厚度约 ${formatHeight(band.highHeightM - band.lowHeightM, 0, unitSystem)} · 不等同云层实测厚度` : '边界不完整，不能计算厚度'}{#if band.extendsAboveChart} · {band.upperBoundaryKnown ? '估算云顶超过 9000 米图框' : '可能延伸到图框以上，上界未确定'}{/if} · 高湿启发式估算，不是云概率</small></div>{/each}</div>
						{:else}<p class="viewer-empty-note">当前没有达到相对湿度 90% 的连续有效区段；这不等于无云。</p>{/if}
					</div>
					<div class="viewer-table-section"><div class="viewer-section-head"><div><p class="viewer-kicker">模式原始层</p><h2>逐层数值</h2></div></div><div class="viewer-table-wrap"><table class="viewer-table"><thead><tr><th>海拔 / 气压</th><th>温度</th><th>露点</th><th>湿度</th><th>风速</th><th>风向</th><th>云量</th></tr></thead><tbody>{#each pointChartGeometry.modelVisible as level (`point-${level.source}-${level.pressureHPa}-${level.heightM}`)}<tr class:viewer-underground-row={Number.isFinite(pointTerrainM) && level.heightM < pointTerrainM}><td>{formatHeight(level.heightM, 0, unitSystem)}<small>{level.source === 'model-surface' ? '模式地形近地面值' : `${level.pressureHPa} 百帕`} · {Number.isFinite(pointTerrainM) && level.heightM < pointTerrainM ? '地形以下，仅模式参考' : '地形以上'}</small></td><td>{formatTemperature(level.temperatureC, 1, unitSystem)}</td><td>{formatTemperature(level.dewPointC, 1, unitSystem)}</td><td>{formatValue(level.relativeHumidityPct, 0, '%')}</td><td>{formatWind(level.windSpeedMs, 1, unitSystem)}</td><td>{formatWindDirection(level.windDirectionDeg)}</td><td>{formatValue(level.cloudPct, 0, '%')}</td></tr>{/each}</tbody></table></div>
						<details class="height-range-details"><summary>按海拔范围查询 · 每 {displayHeightNumber(profileRangeStepM, 0, unitSystem)} {heightUnit(unitSystem)}</summary><div class="height-range-controls"><label>起始海拔<input type="number" min="0" max={displayHeightNumber(9000, 0, unitSystem)} step="any" value={displayHeightNumber(profileRangeStartM ?? profileRangeStartDefaultM, 1, unitSystem)} on:change={(event) => handleProfileRangeChange(event, 'start')} aria-label="高度范围起始海拔" /></label><label>结束海拔<input type="number" min="0" max={displayHeightNumber(9000, 0, unitSystem)} step="any" value={displayHeightNumber(profileRangeEndM ?? profileRangeEndDefaultM, 1, unitSystem)} on:change={(event) => handleProfileRangeChange(event, 'end')} aria-label="高度范围结束海拔" /></label><label>采样间隔<input type="number" min={displayHeightNumber(50, 0, unitSystem)} max={displayHeightNumber(2000, 0, unitSystem)} step="any" value={displayHeightNumber(profileRangeStepM, 0, unitSystem)} on:change={handleProfileRangeStepChange} aria-label={`高度采样间隔，${heightUnit(unitSystem)}`} /></label></div>{#if profileRangeStepError}<p class="viewer-inline-error" role="alert">{profileRangeStepError}</p>{/if}{#if profileRangeRows.length}<div class="viewer-table-wrap"><table class="viewer-table"><thead><tr><th>海拔</th><th>温度</th><th>露点</th><th>湿度</th><th>风速</th><th>风向</th></tr></thead><tbody>{#each profileRangeRows as row (row.heightM)}<tr><td>{formatHeight(row.heightM, 0, unitSystem)}<small>{row.values.reason === 'below-terrain' ? '低于地形' : row.values.ok ? '有效' : '缺测'}</small></td><td>{formatTemperature(row.values.temperatureC, 1, unitSystem)}<small>{methodLabel(row.values.methods?.temperature)}</small></td><td>{formatTemperature(row.values.dewPointC, 1, unitSystem)}<small>{methodLabel(row.values.methods?.dewPoint)}</small></td><td>{formatValue(row.values.humidityPct, 0, '%')}<small>{methodLabel(row.values.methods?.humidity)}</small></td><td>{formatWind(row.values.windSpeedMs, 1, unitSystem)}<small>{methodLabel(row.values.methods?.wind)}</small></td><td>{formatWindDirection(row.values.windDirectionDeg)}</td></tr>{/each}</tbody></table></div>{:else}<p class="viewer-empty-note">{!pointGroundLevels.length ? '当前没有地形以上的有效天气层。' : profileRangeValid ? '当前范围没有采样点，请调整起止海拔。' : '起始海拔不能高于结束海拔。'}</p>{/if}<p class="viewer-footnote">每 {displayHeightNumber(profileRangeStepM, 0, unitSystem)} {heightUnit(unitSystem)} 为展示采样间隔，不代表模式分辨率；模式数据范围外不外推。</p></details></div>
				{:else if profileViewer === 'point'}<div class="viewer-loading" role="status">{pointProfileLoading ? '正在读取高空天气…' : pointProfileError || '当前时刻没有可显示的垂直数据'}</div>{/if}
				{#if profileViewer === 'route'}
					<div class="viewer-stat-grid"><div><span>模式</span><strong>{selectedModel.toUpperCase()}</strong></div><div><span>有垂直数据</span><strong>{routeWeatherSamples.filter(sample => sample.profile?.hasVerticalLayers).length}/{routeWeatherSamples.length} 点</strong></div><div><span>路线距离</span><strong>{formatDistance(routeDistanceM, 1, unitSystem)}</strong></div><div><span>查询高度</span><strong>{formatHeight(Number(targetAltitudeM), 0, unitSystem)} {'海拔'}</strong></div></div>
					<div class="viewer-target-control"><label>查询高度<input type="number" min={displayHeightNumber(0, 0, unitSystem)} max={displayHeightNumber(20_000, 0, unitSystem)} step={unitSystem === 'metric' ? 50 : 100} value={displayHeightNumber(Number(targetAltitudeM), 1, unitSystem)} on:change={handleTargetAltitudeChange} aria-label={`查询高度，${'海拔'}，${heightUnit(unitSystem)}`} />{heightUnit(unitSystem)}</label><span>横轴：路线累计距离 · 纵轴：海拔</span></div>
					<div class="route-nearest-level-slot"><button type="button" class="secondary-button" disabled={!focusedRouteNearestUsableLevel} on:click={queryAtNearestRouteProfileLevel}>{focusedRouteNearestUsableLevel ? `查看最近有效层 ${formatHeight(focusedRouteNearestUsableLevel.heightM, 0, unitSystem)}` : '该点暂无有效高度层'}</button></div>
					<div class="altitude-presets route-altitude-presets" aria-label="常用查询高度">{#each ([3000, 4000, 5000, 6000, 7000, 8000, 9000]) as preset (preset)}<button class:active={Number(targetAltitudeM) === preset} aria-pressed={Number(targetAltitudeM) === preset} on:click={() => targetAltitudeM = preset}>{displayHeightNumber(preset, 0, unitSystem)} {heightUnit(unitSystem)}</button>{/each}</div>
					<div class="route-viewer-controls">
						<div class="metric-tabs" aria-label="剖面显示变量"><button class:active={routeDisplayVariable === 'cloud'} on:click={() => routeDisplayVariable = 'cloud'}>模式云量</button><button class:active={routeDisplayVariable === 'thickness'} on:click={() => routeDisplayVariable = 'thickness'}>云层厚度估算</button><button class:active={routeDisplayVariable === 'humidity'} on:click={() => routeDisplayVariable = 'humidity'}>湿度</button><button class:active={routeDisplayVariable === 'temperature'} on:click={() => routeDisplayVariable = 'temperature'}>温度</button><button class:active={routeDisplayVariable === 'wind'} on:click={() => routeDisplayVariable = 'wind'}>风速</button></div>
						{#if routeDisplayVariable === 'cloud' || routeDisplayVariable === 'thickness'}<div class="metric-tabs" aria-label="云区显示方式"><button class:active={routeContinuousClouds} on:click={() => routeContinuousClouds = true}>连续云区（估算）</button><button class:active={!routeContinuousClouds} on:click={() => routeContinuousClouds = false}>仅采样点</button></div>{/if}
						<span>{routeMetricLabel} · {routeEstimatedCoverage ? '点间云区按最近采样点估算；竖线标出实际采样位置，缺测保留灰色，空白不代表无云。' : '窄色列表示实际天气分析点，列间未采样；空白不代表无云。'} 地形采样更密，不提高天气分辨率。</span>
					</div>
					{#if routeWeatherError}<p class="viewer-inline-error" role="alert">{routeWeatherError}</p>{/if}
					{#if routeDisplayVariable === 'cloud'}
						<div class="viewer-chart-legend" aria-label="模式云量颜色说明"><strong>模式云量</strong><span><i class="legend-clear"></i>0%透明</span><span><i style="background:#67a981"></i>&gt;0–25%</span><span><i style="background:#d7b84f"></i>&gt;25–50%</span><span><i style="background:#df8a4f"></i>&gt;50–75%</span><span><i style="background:#c85d58"></i>&gt;75–100%</span><span><i class="legend-hatch"></i>斜纹：湿度推算可能云区</span><span><i class="legend-missing"></i>灰色：缺测</span></div>
					{:else if routeDisplayVariable === 'thickness'}
						<div class="viewer-chart-legend" aria-label="云层厚度估算图例"><strong>厚度颜色</strong><span><i style="background:#67a981"></i>不足 {displayHeightNumber(500, 0, unitSystem)} {heightUnit(unitSystem)}</span><span><i style="background:#d7b84f"></i>{displayHeightNumber(500, 0, unitSystem)}–不足 {displayHeightNumber(1500, 0, unitSystem)} {heightUnit(unitSystem)}</span><span><i style="background:#df8a4f"></i>{displayHeightNumber(1500, 0, unitSystem)}–不足 {displayHeightNumber(3000, 0, unitSystem)} {heightUnit(unitSystem)}</span><span><i style="background:#c85d58"></i>{displayHeightNumber(3000, 0, unitSystem)} {heightUnit(unitSystem)} 及以上</span><span><i class="legend-hatch"></i>蓝斜纹：相对湿度≥90%的可能云区</span><span><i class="legend-missing"></i>灰斜纹：模式云带边界不完整</span><span>云带边界按相邻模式层中点估算</span></div>
					{:else}<div class="viewer-chart-legend" aria-label="当前变量色阶说明"><strong>{routeMetricLabel}</strong>{#each routeLegendSteps as step (step.label)}<span><i style={`background:${step.color}`}></i>{step.label}</span>{/each}<span><i class="legend-missing"></i>灰色：缺测</span><span><i class="legend-hatch"></i>斜纹：相对湿度≥90%的可能云区</span></div>{/if}
					<section class="route-point-readout" aria-label="路线点具体天气数值">
	<div class="route-readout-heading"><strong>{routePointerReadout ? '指向位置 · 最近采样点' : '查询线 · 已选采样点'}：{routeReadoutSample?.name ?? '尚未选点'}</strong><span>沿线 {formatDistance(routeReadoutSample?.distanceM, 1, unitSystem)} · {selectedModel.toUpperCase()} · {effectiveForecastTimestampMs ? formatForecastTime(effectiveForecastTimestampMs) : '暂无时次'}</span></div>
	<div class="route-readout-values">
		<div><span>查看海拔</span><strong>{formatHeight(routeReadoutAltitudeM, 0, unitSystem)}</strong><small>{routePointerReadout && activeRouteAltitudePointerId === null ? '悬停高度；绿线未改变' : '绿色查询线高度'}</small></div>
		<div><span>该点地形</span><strong>{formatHeight(routeReadoutTerrainM, 0, unitSystem)}</strong><small>{Number.isFinite(routeReadoutSample?.terrainElevationM) ? 'Windy 地形' : '模式地形或缺测'}</small></div>
		<div><span>温度</span><strong>{formatTemperature(routeReadoutWeather?.temperatureC, 1, unitSystem)}</strong><small>{methodLabel(routeReadoutWeather?.methods?.temperature)}</small></div>
		<div><span>相对湿度</span><strong>{formatValue(routeReadoutWeather?.humidityPct, 0, '%')}</strong><small>{methodLabel(routeReadoutWeather?.methods?.humidity)}</small></div>
		<div><span>风速</span><strong>{formatWind(routeReadoutWeather?.windSpeedMs, 1, unitSystem)}</strong><small>{formatWindDirection(routeReadoutWeather?.windDirectionDeg)} · {methodLabel(routeReadoutWeather?.methods?.wind)}</small></div>
		<div><span>模式云量</span><strong>{formatValue(routeReadoutWeather?.cloudPct, 0, '%')}</strong><small>{methodLabel(routeReadoutWeather?.methods?.cloud)}</small></div>
	</div>
	<p title={routeReadoutNotice}>{routeReadoutNotice}</p>
</section>
<div class="route-viewer-chart" use:observeRouteChartWidth><svg viewBox={`0 0 ${crossSectionGeometry.width} ${crossSectionGeometry.height}`} preserveAspectRatio="none" role="group" aria-label="路线距离与海拔天气剖面；可选择各天气采样点" on:pointermove={hoverRouteChart} on:pointerleave={clearRoutePointerReadout}><defs><pattern id="viewer-route-rh-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><rect width="7" height="7" fill="#6fb9d2" fill-opacity=".12"/><line x1="0" y1="0" x2="0" y2="7" stroke="#6fb9d2" stroke-width="2" stroke-opacity=".6"/></pattern><pattern id="viewer-route-incomplete-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><rect width="7" height="7" fill="#737b8b" fill-opacity=".22"/><line x1="0" y1="0" x2="0" y2="7" stroke="#aab1bd" stroke-width="2" stroke-opacity=".75"/></pattern><marker id="viewer-wind-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#f5d16a"/></marker></defs><text x={crossSectionGeometry.plot.left} y={crossSectionGeometry.plot.top - 14} class="viewer-axis-title">海拔（{heightUnit(unitSystem)}）</text>{#each profileAltitudeTicks as tick (tick)}<line x1={crossSectionGeometry.plot.left} x2={crossSectionGeometry.plot.right} y1={crossSectionGeometry.y(tick)} y2={crossSectionGeometry.y(tick)} class="viewer-grid-line"/><text x={crossSectionGeometry.plot.left - 10} y={crossSectionGeometry.y(tick) + 5} text-anchor="end" class="viewer-axis-label">{displayHeightNumber(tick, 0, unitSystem)}</text>{/each}{#each crossSectionGeometry.cells as cell (`viewer-${cell.sampleIndex}-${cell.pressureHPa ?? 'missing'}-${cell.y}`)}<rect x={cell.x} y={cell.y} width={cell.width} height={cell.height} fill={cell.missing ? '#5a647b' : crossSectionColor(cell.value, routeDisplayVariable)} opacity={cell.missing ? .55 : .74} stroke={cell.missing ? '#b5c0d0' : '#0b1122'} stroke-width="1" stroke-dasharray={cell.missing ? '3 3' : undefined}><title>{routeCellTitle(cell, unitSystem)}</title></rect>{/each}{#each crossSectionGeometry.directCloudBands as band (`viewer-model-cloud-${band.sampleIndex}-${band.band.lowHeightM}`)}{#if routeDisplayVariable === 'thickness'}<rect x={band.x} y={band.y} width={band.width} height={band.height} fill={band.band.thicknessM === null ? 'url(#viewer-route-incomplete-hatch)' : cloudThicknessColor(band.band.thicknessM)} opacity=".92" stroke={band.band.thicknessM === null ? '#c1c9d4' : '#f2f5fb'} stroke-dasharray={band.band.thicknessM === null ? '2 3' : undefined}><title>{directCloudBandTitle(band.band, unitSystem)}</title></rect>{/if}{#if routeDisplayVariable === 'thickness' && band.extendsAboveChart}<path d={`M${band.x + band.width / 2 - 6},${crossSectionGeometry.plot.top + 9} l6,-8 l6,8 Z`} class="viewer-cloud-overflow-marker"><title>{band.band.upperBoundaryKnown ? '估算云顶超过 9000 米图框' : '可能云区延伸到图框以上，云顶未确定'}</title></path>{/if}{/each}{#each crossSectionGeometry.possibleCloudBands as band (`viewer-rh-${band.sampleIndex}-${band.y}`)}<rect x={band.x} y={band.y} width={band.width} height={band.height} fill={routeDisplayVariable === 'thickness' ? band.band.thicknessM === null ? 'url(#viewer-route-incomplete-hatch)' : cloudThicknessColor(band.band.thicknessM) : 'url(#viewer-route-rh-hatch)'} opacity={routeDisplayVariable === 'thickness' && band.band.thicknessM !== null ? 0.86 : 1} stroke={routeDisplayVariable === 'thickness' && band.band.thicknessM !== null ? '#d7e4ea' : 'none'} stroke-dasharray={routeDisplayVariable === 'thickness' && band.band.thicknessM !== null ? '4 3' : undefined}><title>{routeCloudBandTitle(band.band, unitSystem)}</title></rect>{#if band.extendsAboveChart}<path d={`M${band.x + band.width / 2 - 6},${crossSectionGeometry.plot.top + 9} l6,-8 l6,8 Z`} class="viewer-cloud-overflow-marker"><title>{band.band.upperBoundaryKnown ? '估算云顶超过 9000 米图框' : '可能云区延伸到图框以上，云顶未确定'}</title></path>{/if}{/each}{#each crossSectionGeometry.levelMarks as mark (`route-level-${mark.sampleIndex}-${mark.pressureHPa ?? '未知'}-${mark.heightM}`)}{#if routeDisplayVariable !== 'thickness'}<circle cx={mark.x} cy={mark.y} r="3.5" class={`viewer-level-mark ${mark.missing ? 'viewer-level-mark--missing' : ''}`}><title>{formatHeight(mark.heightM, 0, unitSystem)} · {mark.pressureHPa ?? '气压未知'} 百帕 · {mark.missing ? '缺测' : routeMetricValue(mark.value, unitSystem)}</title></circle>{/if}{/each}{#if routeDisplayVariable === 'temperature'}{#each routeFreezingMarks as mark, index (index)}<circle cx={mark.x} cy={mark.y} r="5" class="viewer-freezing-mark"><title>{mark.name} · 0°C 温度层估算 {formatHeight(mark.heightM, 0, unitSystem)} · 路线距离 {formatDistance(mark.distanceM, 1, unitSystem)}</title></circle>{/each}{/if}{#if routeTargetLine.line}<path d={routeTargetLine.line} class="viewer-target-line viewer-route-target-path"/>{/if}{#each routeTargetLine.points as targetPoint (`target-${targetPoint.sampleIndex}`)}<circle cx={targetPoint.x} cy={targetPoint.y} r={targetPoint.sampleIndex === routeFocusedIndex ? 6 : 3.5} class="viewer-route-target-point"/>{/each}{#if routeTerrainOverlay.area}<path d={routeTerrainOverlay.area} class="viewer-terrain-area"/>{/if}{#if routeTerrainOverlay.line}<path d={routeTerrainOverlay.line} class="viewer-terrain-line"/>{:else if crossSectionGeometry.terrainPath}<path d={crossSectionGeometry.terrainPath} class="viewer-terrain-line"/>{/if}{#if routeTerrainOverlay.highest && routeTerrainOverlay.highest.elevationM <= 9_000}<circle cx={routeTerrainOverlay.highest.x} cy={routeTerrainOverlay.highest.y} r="5" class="viewer-highest-dot"><title>路线最高地形采样点：{formatHeight(routeTerrainOverlay.highest.elevationM, 0, unitSystem)}</title></circle>{/if}{#each routeWindMarks as wind (wind.sampleIndex)}<g transform={`translate(${wind.x},${wind.y}) rotate(${windFlowRotationDeg(wind.directionDeg)})`}><line x1="-11" y1="0" x2="9" y2="0" class="viewer-wind-arrow" marker-end="url(#viewer-wind-arrow)"><title>{wind.name}：风速 {formatWind(wind.speedMs, 1, unitSystem)}；风来自 {formatWindDirection(wind.directionDeg)}</title></line></g>{/each}{#each crossSectionGeometry.sampleMarks as mark (mark.sampleIndex)}<line x1={mark.x} x2={mark.x} y1={crossSectionGeometry.plot.bottom} y2={crossSectionGeometry.plot.top} class={mark.sampleIndex === routeFocusedIndex ? 'viewer-sample-line viewer-sample-line--active' : 'viewer-sample-line'}/>{#if mark.sampleIndex === 0 || mark.sampleIndex === crossSectionGeometry.sampleMarks.length - 1 || crossSectionGeometry.sampleMarks.length <= 10}<text x={mark.labelX} y={crossSectionGeometry.plot.bottom + 28} text-anchor={mark.labelAnchor} class="viewer-axis-label">{formatDistance(mark.distanceM, 1, unitSystem)}</text>{/if}<rect x={mark.left} y={crossSectionGeometry.plot.top} width={mark.width} height={crossSectionGeometry.plot.bottom - crossSectionGeometry.plot.top} class="route-sample-hit" role="button" tabindex="0" aria-label={`查看${mark.name}，路线距离 ${formatDistance(mark.distanceM, 1, unitSystem)}`} on:click={() => selectRouteSample(mark.sampleIndex)} on:keydown={(event) => handleRouteSampleKeydown(event, mark.sampleIndex)}><title>选择{mark.name}查看逐层天气</title></rect>{/each}
{#if Number.isFinite(Number(targetAltitudeM)) && Number(targetAltitudeM) >= 0 && Number(targetAltitudeM) <= crossSectionGeometry.maxHeightM}
	{@const lineY = crossSectionGeometry.y(Number(targetAltitudeM))}
	{@const labelY = lineY < crossSectionGeometry.plot.top + 36 ? lineY + 8 : lineY - 32}
	<g class="route-altitude-control" role="slider" tabindex="0" aria-label="上下拖动查询海拔线" aria-orientation="vertical" aria-valuemin="0" aria-valuemax={crossSectionGeometry.maxHeightM} aria-valuenow={Number(targetAltitudeM)} aria-valuetext={`${formatHeight(Number(targetAltitudeM), 0, unitSystem)} 海拔`} on:pointerdown|stopPropagation={beginRouteAltitudeDrag} on:pointermove={moveRouteAltitudeDrag} on:pointerup={endRouteAltitudeDrag} on:pointercancel={endRouteAltitudeDrag} on:lostpointercapture={endRouteAltitudeDrag} on:click|stopPropagation on:keydown={(event) => handleTrendSliderKeydown(event, crossSectionGeometry.maxHeightM)}>
		<line x1={crossSectionGeometry.plot.left} x2={crossSectionGeometry.plot.right} y1={lineY} y2={lineY} class="viewer-target-line route-altitude-visible"/>
		<rect x={crossSectionGeometry.plot.left} y={lineY - 12} width={crossSectionGeometry.plot.right - crossSectionGeometry.plot.left} height="24" class="route-altitude-hit"><title>上下拖动调整查询海拔；方向键每次调整 50 米</title></rect>
		<rect x={crossSectionGeometry.plot.right - 24} y={lineY - 12} width="24" height="24" rx="5" class="route-altitude-grip"/>
		<path d={`M${crossSectionGeometry.plot.right - 17},${lineY - 3} l5,-5 l5,5 M${crossSectionGeometry.plot.right - 17},${lineY + 3} l5,5 l5,-5`} class="route-altitude-chevron"/>
		<g class="route-altitude-readout"><rect x={crossSectionGeometry.plot.right - 180} y={labelY} width="180" height="26" rx="4"/><text x={crossSectionGeometry.plot.right - 90} y={labelY + 18} text-anchor="middle">海拔 {formatHeight(Number(targetAltitudeM), 0, unitSystem)}</text></g>
	</g>
{/if}
</svg></div>
					<div class="route-chart-note">{#if routeDisplayVariable === 'temperature'}<span><i class="freezing-level-key"></i>圆点为各分析点的 0°C 温度层估算高度</span>{/if}<span><i class="wind-arrow-key"></i>黄色箭头指向风的去向，位于查询高度</span><span>没有箭头表示该高度的风向未返回</span><span>点击图中采样列可查看该点完整逐层数值</span></div>
					<div class="route-terrain-note">{routeTerrainOverlay.highest ? `路线最高地形采样点：${formatDistance(routeTerrainOverlay.highest.distanceM, 1, unitSystem)} 处，${formatHeight(routeTerrainOverlay.highest.elevationM, 0, unitSystem)}${routeTerrainOverlay.highest.elevationM > crossSectionGeometry.maxHeightM ? '，高于图框上限，未在图中标点' : ''}` : '尚无足够的路线地形点绘制地形线'} · 地形采样与天气分析点分开，地形采样不会提高天气分辨率。</div><div class="route-surface-gust-note"><strong>路线分析点地面阵风</strong>{#if routeSurfaceGustSummary.maximum}<span>最高 {formatWind(routeSurfaceGustSummary.maximum.gustMs, 1, unitSystem)} · {routeSurfaceGustSummary.maximum.name} · {formatDistance(routeSurfaceGustSummary.maximum.distanceM, 1, unitSystem)}</span>{:else}<span>Windy 当前时刻未返回地面阵风。</span>{/if}<small>{routeSurfaceGustSummary.availableCount}/{routeSurfaceGustSummary.totalCount} 个点有值；这是地面字段，不代表高空。</small></div>
					<div class="precipitation-section"><div class="precipitation-heading"><strong>路线地面降水</strong><span>单位：{precipitationUnit(unitSystem)} / {precipitationIntervalLabel}</span></div>{#if routePrecipitationGeometry.marks.some(mark => mark.available)}<div class="precipitation-chart"><svg viewBox={`0 0 ${routeChartWidth} 120`} preserveAspectRatio="none" role="img" aria-label="沿路线的地面降水和雪降水量"><line x1={routePrecipitationGeometry.plot.left} x2={routePrecipitationGeometry.plot.right} y1={routePrecipitationGeometry.plot.bottom} y2={routePrecipitationGeometry.plot.bottom} class="viewer-axis-line"/><line x1={routePrecipitationGeometry.plot.left} x2={routePrecipitationGeometry.plot.right} y1={routePrecipitationGeometry.plot.top} y2={routePrecipitationGeometry.plot.top} class="viewer-grid-line"/><text x="3" y={routePrecipitationGeometry.plot.top + 5} class="viewer-axis-label">{formatPrecipitation(routePrecipitationGeometry.scaleMaxMm, 1, unitSystem)}</text><text x="18" y={routePrecipitationGeometry.plot.bottom + 5} class="viewer-axis-label">0</text>{#each routePrecipitationGeometry.marks as mark (mark.key)}{#if mark.amountMm !== null}<rect x={mark.x - mark.width - 1} y={mark.totalY} width={mark.width} height={Math.max(1, mark.totalHeight)} class="precipitation-total-bar"><title>{mark.name}：降水 {formatPrecipitation(mark.amountMm, 1, unitSystem)} / {precipitationIntervalLabel}</title></rect>{/if}{#if mark.snowMm !== null}<rect x={mark.x + 1} y={mark.snowY} width={mark.width} height={Math.max(1, mark.snowHeight)} class="precipitation-snow-bar"><title>{mark.name}：雪降水 {formatPrecipitation(mark.snowMm, 1, unitSystem)} / {precipitationIntervalLabel}</title></rect>{/if}<circle cx={mark.x} cy={routePrecipitationGeometry.plot.bottom} r="3" class="precipitation-sample-dot"><title>{mark.available ? `${mark.name} · ${formatDistance(mark.distanceM, 1, unitSystem)}` : `${mark.name} · 降水数据缺测`}</title></circle>{#if mark.distanceM === 0 || mark.distanceM === routeDistanceM || routePrecipitationGeometry.marks.length <= 10}<text x={mark.x} y="114" text-anchor="middle" class="viewer-axis-label">{formatDistance(mark.distanceM, 1, unitSystem)}</text>{/if}{/each}</svg></div><div class="viewer-chart-legend"><span><i class="precipitation-key-total"></i>降水量</span><span><i class="precipitation-key-snow"></i>雪降水量</span><span>按预报时段累计；不是降水强度。地面字段不代表各高空高度的降水。</span></div>{:else}<p class="viewer-empty-note">当前模型未返回沿线地面降水数据。</p>{/if}</div>
					<div class="route-sample-buttons" aria-label="选择路线分析点">{#each routeWeatherSamples as sample, index (sample.key)}<button class:active={routeFocusedIndex === index} on:click={() => selectRouteSample(index)}><strong>{sample.name}</strong><span>{formatDistance(sample.distanceM, 1, unitSystem)}</span></button>{/each}</div>
					{#if routeComparisonRows.length}
						<section class="route-comparison-section">
							<div class="viewer-section-head"><div><p class="viewer-kicker">路线逐点对照</p><h2>各分析点天气摘要</h2></div><span>{routeComparisonRows.filter(row => row.hasForecast).length}/{routeComparisonRows.length} 点已读取 · 按路线顺序</span></div>
							<p class="route-comparison-intro">对照当前时刻和查询高度的地形、温湿风与云层判断。点按任一卡片可查看该点完整垂直剖面；地面降水和能见度单独标注，不当作高空值。</p>
							<div class="route-comparison-grid">
								{#each routeComparisonRows as row (row.key)}
									<article class:route-comparison-card--active={routeWeatherSamples[routeFocusedIndex]?.key === row.key} class="route-comparison-card">
										<button type="button" class="route-comparison-select" disabled={!row.hasForecast} aria-pressed={routeWeatherSamples[routeFocusedIndex]?.key === row.key} on:click={() => selectRouteSample(routeWeatherSamples.findIndex(sample => sample.key === row.key))}>
											<span>{row.name}</span><small>{row.lat === null || row.lon === null ? '坐标缺测' : `${row.lat.toFixed(5)}°，${row.lon.toFixed(5)}°`}</small>
											<strong>{row.distanceM === null ? '距离缺测' : `沿线 ${formatDistance(row.distanceM, 1, unitSystem)}`}</strong>
										</button>
										<div class="route-comparison-values">
											<div><span>地形海拔</span><strong>{formatHeight(row.terrainElevationM, 0, unitSystem)}</strong><small>{row.terrainSource === 'windy' ? 'Windy 地形' : row.terrainSource === 'model' ? '模式地形' : '来源未知'}</small></div>
											<div><span>查询点海拔</span><strong>{formatHeight(row.targetHeightMsl, 0, unitSystem)}</strong><small>海拔查询</small></div>
											<div><span>温度</span><strong>{formatTemperature(row.weather.temperatureC, 1, unitSystem)}</strong><small>{methodLabel(row.weather.methods?.temperature)}</small></div>
											<div><span>相对湿度</span><strong>{formatValue(row.weather.humidityPct, 0, '%')}</strong><small>{methodLabel(row.weather.methods?.humidity)}</small></div>
											<div><span>风速 / 风向</span><strong>{formatWind(row.weather.windSpeedMs, 1, unitSystem)} · {formatWindDirection(row.weather.windDirectionDeg)}</strong><small>{methodLabel(row.weather.methods?.wind)}</small></div>
							<div><span>查询高度云量</span><strong>{formatValue(row.weather.cloudPct, 0, '%')}</strong><small>{methodLabel(row.weather.methods?.cloud)}</small></div>
							<div><span>0°C 温度层估算</span><strong>{freezingLevelText(row.freezingLevels)}</strong><small>相邻有效模式温度层插值</small></div>
											<div><span>直接云底</span><strong>{formatHeight(row.cloudBaseM, 0, unitSystem)}</strong><small>Windy 返回值</small></div>
											<div><span>地面降水 / 雪降水</span><strong>{formatPrecipitation(row.precipAmountMm, 1, unitSystem)} / {formatPrecipitation(row.precipSnowAmountMm, 1, unitSystem)}</strong><small>{precipitationIntervalLabel} 累计</small></div>
											{#if row.hasForecast}<div class="target-visibility-unavailable"><span>目标高度能见度</span><strong>未提供</strong><small>地面能见度不代替高空</small></div>{/if}{#if row.surfaceVisibilityM !== null}<div><span>地面能见度</span><strong>{formatVisibility(row.surfaceVisibilityM)}</strong><small>不代表高空</small></div>{/if}
										</div>
										<p class={`cloud-assessment cloud-assessment--${row.cloudAssessment.kind}`}>{row.hasForecast ? row.cloudAssessment.text : row.error || (routeWeatherLoading ? '天气读取中…' : '该分析点暂无预报数据')}</p>
									</article>
								{/each}
							</div>
						</section>
					{/if}
					{#if focusedRouteSample?.profile?.ok && focusedRouteFrame}
						<div class="route-point-detail viewer-route-detail">
							<strong>{focusedRouteSample.name} · {focusedRouteSample.lat.toFixed(3)}°，{focusedRouteSample.lon.toFixed(3)}°</strong>
							<span>{focusedRouteTerrainSource} {focusedRouteTerrainM === null ? '未知' : `${formatHeight(focusedRouteTerrainM, 0, unitSystem)} 海拔`} · 直接云底 {focusedRouteFrame.cloudBaseM === null ? '未返回' : `${formatHeight(focusedRouteFrame.cloudBaseM, 0, unitSystem)}`} · 云顶字段未返回</span>
									{#if focusedRouteSample.profile.verticalDataNotice}<span>{focusedRouteSample.profile.dataSource === 'windy-legacy-meteogram' ? '逐层数据来源：Windy 旧版兼容接口（官方标记弃用）· ' : ''}{focusedRouteSample.profile.verticalDataNotice}</span>{/if}
							{#if focusedRouteFrame.timeAlignmentNotice}<span role="status">{focusedRouteFrame.timeAlignmentNotice}</span>{/if}
							<span>{formatForecastTime(effectiveForecastTimestampMs ?? Date.now())} 北京时间 · 查询高度 {formatHeight(Number(targetAltitudeM), 0, unitSystem)} {'海拔'} 附近模式云量 {formatValue(focusedRouteTargetResult?.cloudPct, 0, '%')} · {methodLabel(focusedRouteTargetResult?.methods?.cloud)}</span>
							<p class={`cloud-assessment cloud-assessment--${focusedRouteCloudAssessment.kind}`}>{focusedRouteCloudAssessment.text}</p>
							<p class="freezing-level-note" role="status">该路线点 0°C 温度层估算：{freezingLevelText(focusedRouteFreezingLevels)}。只在相邻有效模式温度层间线性插值，不跨缺测，也不外推。</p>
							{#if focusedRouteFrame.surfaceWindGustMs !== null}<span>地面阵风 {formatWind(focusedRouteFrame.surfaceWindGustMs, 1, unitSystem)}（地面字段，不代表高空）</span>{/if}
							{#if focusedRouteHasGroupedClouds}<span>低云 {formatValue(focusedRouteFrame.lowCloudPct, 0, '%')} · 中云 {formatValue(focusedRouteFrame.mediumCloudPct, 0, '%')} · 高云 {formatValue(focusedRouteFrame.highCloudPct, 0, '%')}</span>{/if}
							{#if focusedRoutePotentialIcingLevels.length}<div class="condition-cue"><strong>该点存在零下云层信号</strong><p>{focusedRoutePotentialIcingLevels.length} 个模式层同时满足温度不高于 0°C 和云量或高湿信号，只提示可能存在结冰条件，不表示一定结冰，也不估算强度。</p><span>{#each focusedRoutePotentialIcingLevels as level, icingIndex (`route-icing-${level.pressureHPa}-${level.heightM}`)}{#if icingIndex > 0} · {/if}{formatHeight(level.heightM, 0, unitSystem)}{/each}</span></div>{/if}
							{#if focusedRouteDirectCloudBands.length}<div class="possible-cloud-list direct-cloud-list"><strong>模式云带层界估算</strong>{#each focusedRouteDirectCloudBands as band (`route-cloud-${band.lowHeightM}-${band.highHeightM}`)}<div><span>{band.lowerBoundaryKnown ? formatHeight(band.lowHeightM, 0, unitSystem) : '低边界未确定'}–{band.upperBoundaryKnown ? formatHeight(band.highHeightM, 0, unitSystem) : '高边界未确定'}</span><small>{band.thicknessM === null ? '边界不完整，不能估算厚度' : `层界估算厚度约 ${formatHeight(band.thicknessM, 0, unitSystem)}`}{#if band.highHeightM > 9_000} · {band.upperBoundaryKnown ? '估算云顶超过 9000 米图框' : '可能延伸到图框以上，云顶未确定'}{/if} · 最高逐层云量 {formatValue(band.peakCloudPct, 0, '%')}</small></div>{/each}</div>{/if}
							<div class="target-result-grid route-target-results"><div><span>温度</span><strong>{formatTemperature(focusedRouteTargetResult?.temperatureC, 1, unitSystem)}</strong><small>{methodLabel(focusedRouteTargetResult?.methods?.temperature)}</small></div><div><span>露点</span><strong>{formatTemperature(focusedRouteTargetResult?.dewPointC, 1, unitSystem)}</strong><small>{methodLabel(focusedRouteTargetResult?.methods?.dewPoint)}</small></div><div><span>相对湿度</span><strong>{formatValue(focusedRouteTargetResult?.humidityPct, 0, '%')}</strong><small>{methodLabel(focusedRouteTargetResult?.methods?.humidity)}</small></div><div><span>风速</span><strong>{formatWind(focusedRouteTargetResult?.windSpeedMs, 1, unitSystem)}</strong><small>{methodLabel(focusedRouteTargetResult?.methods?.wind)}</small></div><div><span>风向</span><strong>{formatWindDirection(focusedRouteTargetResult?.windDirectionDeg)}</strong><small>{methodLabel(focusedRouteTargetResult?.methods?.wind)}</small></div><div class="target-visibility-unavailable"><span>目标高度能见度</span><strong>未提供</strong><small>地面能见度不代替高空</small></div></div>
							<div class="route-point-profile-block">
								<div class="viewer-section-head"><div><p class="viewer-kicker">所选路线点 · 单点剖面</p><h2>海拔 0–9000 米垂直变化</h2></div><span>点按或拖动任一图，路线查询高度同步</span></div>
								<div class="profile-coverage-notice route-profile-coverage" role="status">
									<strong>{focusedRouteTargetResult?.reason === 'below-terrain' ? `查询海拔 ${formatHeight(focusedRouteTargetAltitudeMsl, 0, unitSystem)} 低于地形 ${formatHeight(focusedRouteTerrainM, 0, unitSystem)}；该高度没有可用天气值。` : focusedRouteTrendMetrics.some(metric => metric.geometry?.path) ? '已按 Windy 返回的有效高度层绘制趋势。' : '当前时刻没有足够的相邻高度层形成趋势线。'}</strong>
									<p>{#each focusedRouteTrendMetrics as metric, metricIndex (`coverage-${metric.field}`)}{#if metricIndex > 0} · {/if}{metric.title} {metric.geometry?.points.length ?? 0} 个有效层{/each}。数值只取 Windy 原始层；每项至少需要两个相邻有效层才连线，缺测不补齐、不外推。</p>
								{#if focusedRouteNearestUsableLevel}
									<div class="route-nearest-level-summary">
										<div><strong>最近有值的 Windy 模式层：{formatHeight(focusedRouteNearestUsableLevel.heightM, 0, unitSystem)}{focusedRouteNearestUsableLevel.source === 'model-surface' ? ' · 模式近地面' : ''}</strong><span>{#if focusedRouteNearestUsableLevel.source !== 'model-surface'}气压 {focusedRouteNearestUsableLevel.pressureHPa} 百帕 · {/if}温度 {formatTemperature(focusedRouteNearestUsableLevel.temperatureC, 1, unitSystem)} · 湿度 {formatValue(focusedRouteNearestUsableLevel.relativeHumidityPct, 0, '%')} · 风 {formatWind(focusedRouteNearestUsableLevel.windSpeedMs, 1, unitSystem)} {formatWindDirection(focusedRouteNearestUsableLevel.windDirectionDeg)} · 云量 {formatValue(focusedRouteNearestUsableLevel.cloudPct, 0, '%')}</span></div>
										<button type="button" class="secondary-button" on:click={queryAtNearestRouteProfileLevel}>把查询线移到此层</button>
									</div>
								{/if}
								</div>
								<div class="trend-grid route-point-trend-grid" use:observeTrendWidth>
									{#each focusedRouteTrendMetrics as metric (metric.field)}
										{@const geometry = metric.geometry}
										<div class="trend-panel">
						<div class="trend-panel-heading"><h3>{metric.title} <small>{trendUnit(metric.field, unitSystem)}</small></h3><span>{trendCoverageSummary(geometry, metric.field, metric.digits)}</span></div>
										{#if geometry}
											{@const standalonePoints = geometry.referencePoints.filter(point => point.belowTerrain || geometry.isolatedPoints.some(isolated => isolated.heightM === point.heightM && isolated.value === point.value))}
											{#if !geometry.path}<p class="trend-data-note trend-data-note--top">{geometry.points.length === 1 ? `地形以上只有 ${formatHeight(geometry.points[0].heightM, 0, unitSystem)} 这一层有值；单层无法形成趋势线，原始值列在下方。` : geometry.points.length > 1 ? geometry.hasRepeatedHeights ? '多组原始值落在相同海拔，不能形成垂直趋势线；原始值列在下方。' : `地形以上有 ${geometry.points.length} 个有效层，但缺测或模式层断档，没有可连成的趋势线；原始值列在下方。` : standalonePoints.length ? '地形以上没有有效值；下方灰色模式层位于地形以下，仅作参考，不能代表当地大气。' : 'Windy 当前时刻未返回该变量的有效高度值。'}</p>{/if}
											{#if standalonePoints.length}<div class="trend-observed-points" aria-label={`${metric.title}的 Windy 原始数据点`}>{#each standalonePoints as point (`route-observed-${metric.field}-${point.heightM}-${point.value}`)}<span class="trend-observed-point" style={`--trend-color:${point.belowTerrain ? '#9aa3b2' : metric.color}`}><strong>{formatHeight(point.heightM, 0, unitSystem)}{point.belowTerrain ? ' · 地形下参考' : ''}</strong><b>{formatTrendValue(point.value, metric.field, metric.digits, unitSystem)}</b><small>{point.source === 'model-surface' ? '模式地形近地面值' : `${point.pressureHPa} 百帕模式层`}</small></span>{/each}</div>{/if}
							<svg viewBox={`0 0 ${trendChartWidth} 320`} preserveAspectRatio="none" role="group" aria-label={`${focusedRouteSample.name} ${metric.title}垂直剖面`}>
													{#if geometry.belowTerrainPointCount > 0 && Number.isFinite(focusedRouteTerrainM) && focusedRouteTerrainM >= 0 && focusedRouteTerrainM <= geometry.maxHeightM}<defs><clipPath id={`route-point-below-${metric.field}`}><rect x={geometry.plot.left} y={geometry.plot.top} width={Math.max(0, geometry.x(Number(focusedRouteTerrainM)) - geometry.plot.left)} height={geometry.plot.bottom - geometry.plot.top}/></clipPath></defs><rect x={geometry.plot.left} y={geometry.plot.top} width={Math.max(0, geometry.x(Number(focusedRouteTerrainM)) - geometry.plot.left)} height={geometry.plot.bottom - geometry.plot.top} class="viewer-below-terrain-area"/>{/if}
													{#each geometry.valueTicks as tick (`route-${metric.field}-value-${tick}`)}<line x1={geometry.plot.left} x2={geometry.plot.right} y1={geometry.y(tick)} y2={geometry.y(tick)} class="viewer-grid-line"/><text x="8" y={geometry.y(tick) + 5} class="viewer-axis-label">{formatTrendValue(tick, metric.field, metric.digits, unitSystem)}</text>{/each}
														{#each geometry.altitudeTicks as tick (`route-${metric.field}-height-${tick}`)}<line x1={geometry.x(tick)} x2={geometry.x(tick)} y1={geometry.plot.top} y2={geometry.plot.bottom} class="viewer-grid-line viewer-grid-vertical"/><text x={geometry.x(tick)} y="307" text-anchor={tick === 0 ? 'start' : tick === geometry.maxHeightM ? 'end' : 'middle'} class="viewer-axis-label">{displayHeightNumber(tick, 0, unitSystem)} {heightUnit(unitSystem)}</text>{/each}
													{#if geometry.referencePath && geometry.belowTerrainPointCount > 0 && Number.isFinite(focusedRouteTerrainM) && focusedRouteTerrainM >= 0 && focusedRouteTerrainM <= geometry.maxHeightM}<path d={geometry.referencePath} class="trend-line trend-line--reference" clip-path={`url(#route-point-below-${metric.field})`} style={`--trend-color:${metric.color}`}/>{/if}
												{#if geometry.path}<path d={geometry.path} class="trend-line" style={`--trend-color:${metric.color};stroke:${metric.color};stroke-width:4px;fill:none`}/>{/if}
													{#each geometry.referencePoints.filter(point => point.belowTerrain) as point (`route-reference-${metric.field}-${point.heightM}-${point.value}`)}<circle cx={point.x} cy={point.y} r="3.8" class="trend-reference-dot"><title>{formatHeight(point.heightM, 0, unitSystem)} · {formatTrendValue(point.value, metric.field, metric.digits, unitSystem)} · 地形以下，仅作模式参考</title></circle>{/each}
													{#each geometry.points as point (`route-trend-${metric.field}-${point.heightM}-${point.value}`)}<circle cx={point.x} cy={point.y} r="6" class="trend-dot" style={`--trend-color:${metric.color}`}><title>{formatHeight(point.heightM, 0, unitSystem)} · {formatTrendValue(point.value, metric.field, metric.digits, unitSystem)} · Windy 模式层</title></circle>{/each}
													{#if Number.isFinite(focusedRouteTargetAltitudeMsl) && focusedRouteTargetAltitudeMsl >= 0 && focusedRouteTargetAltitudeMsl <= geometry.maxHeightM}{@const queryX = geometry.x(Number(focusedRouteTargetAltitudeMsl))}{@const queryValue = altitudeTrendValueAt(geometry, Number(focusedRouteTargetAltitudeMsl))}{@const queryBelowTerrain = Number.isFinite(focusedRouteTerrainM) && Number(focusedRouteTargetAltitudeMsl) < Number(focusedRouteTerrainM)}<line x1={queryX} x2={queryX} y1={geometry.plot.top} y2={geometry.plot.bottom} class="viewer-target-line"/><rect x={Math.min(geometry.plot.right - 154, Math.max(geometry.plot.left, queryX - 77))} y="3" width="154" height="22" rx="4" class="viewer-target-tag"/><text x={Math.min(geometry.plot.right - 146, Math.max(geometry.plot.left + 8, queryX - 69))} y="18" class="viewer-target-label">查询 {formatHeight(Number(focusedRouteTargetAltitudeMsl), 0, unitSystem)}</text>{#if queryValue !== null}<line x1={geometry.plot.left} x2={geometry.plot.right} y1={geometry.y(queryValue)} y2={geometry.y(queryValue)} class="viewer-target-value-line"/><circle cx={queryX} cy={geometry.y(queryValue)} r="5" class="viewer-query-dot" style={`--trend-color:${metric.color}`}/>{/if}<text x={geometry.plot.right - 2} y={geometry.plot.top + 15} text-anchor="end" class="viewer-query-value-label">{queryValue !== null ? formatTrendValue(queryValue, metric.field, metric.digits, unitSystem) : queryBelowTerrain ? '低于地形' : '该高度缺测'}</text>{/if}
													<rect x={geometry.plot.left} y={geometry.plot.top} width={geometry.plot.right - geometry.plot.left} height={geometry.plot.bottom - geometry.plot.top} class="trend-altitude-slider" role="slider" tabindex="0" aria-label={`拖动选择查询海拔：${metric.title}`} aria-valuemin="0" aria-valuemax={geometry.maxHeightM} aria-valuenow={Math.min(geometry.maxHeightM, Math.max(0, Math.round(Number(focusedRouteTargetAltitudeMsl ?? 0) / 50) * 50))} aria-valuetext={`${formatHeight(focusedRouteTargetAltitudeMsl, 0, unitSystem)} 海拔`} on:pointerdown={(event) => beginTrendDrag(event, geometry)} on:pointermove={(event) => moveTrendDrag(event, geometry)} on:pointerup={endTrendDrag} on:pointercancel={endTrendDrag} on:keydown={(event) => handleTrendSliderKeydown(event, geometry.maxHeightM)}><title>点按或拖动选择高度，路线高度线会同步更新</title></rect>
													{#each geometry.points as point (`route-select-${metric.field}-${point.heightM}-${point.value}`)}<circle cx={point.x} cy={point.y} r="12" class="trend-point-hit" role="button" tabindex="0" aria-label={`查询 ${formatHeight(point.heightM, 0, unitSystem)}高度，${metric.title} ${formatTrendValue(point.value, metric.field, metric.digits, unitSystem)}`} on:pointerdown|stopPropagation on:click|stopPropagation={() => selectTrendPoint(point.heightM)} on:keydown|stopPropagation={(event) => handleTrendPointKeydown(event, point.heightM)}><title>点按跳转到该模式层</title></circle>{/each}
												</svg>
											{:else}<p class="viewer-empty-chart">Windy 当前时刻没有该变量的有效高度层。</p>{/if}
										</div>
									{/each}
								</div>
							</div>
							<div class="viewer-table-wrap"><table class="viewer-table"><thead><tr><th>海拔 / 气压</th><th>温度</th><th>露点</th><th>湿度</th><th>风速</th><th>风向</th><th>云量</th></tr></thead><tbody>{#each focusedRouteLevels as level (`route-${level.source}-${level.pressureHPa}-${level.heightM}`)}<tr><td>{formatHeight(level.heightM, 0, unitSystem)}<small>{level.source === 'model-surface' ? '模式地形近地面值' : `${level.pressureHPa} 百帕`}</small></td><td>{formatTemperature(level.temperatureC, 1, unitSystem)}</td><td>{formatTemperature(level.dewPointC, 1, unitSystem)}</td><td>{formatValue(level.relativeHumidityPct, 0, '%')}</td><td>{formatWind(level.windSpeedMs, 1, unitSystem)}</td><td>{formatWindDirection(level.windDirectionDeg)}</td><td>{formatValue(level.cloudPct, 0, '%')}</td></tr>{/each}</tbody></table></div>
						</div>
					{:else}<div class="viewer-loading">所选分析点没有可显示的垂直天气数据。</div>{/if}
				{/if}
				<p class="viewer-footnote">曲线连接 Windy 返回的模式高度层，仅供阅读；缺测不补齐、不外推，也不代表更高的气象分辨率。</p>
			</div>
		</div>
	{/if}
</div>

<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import ObservationPanel from './ObservationPanel.svelte';
	import { destination } from './lib/observation-geometry.js';
	import { getElevation, getMeteogramForecastData, getPointForecastData } from '@windy/fetch';
	import store from '@windy/store';
	import { map } from '@windy/map';
	import { singleclick } from '@windy/singleclick';
	import broadcast from '@windy/broadcast';
	import config from './pluginConfig';
		import { copyTextToClipboard } from './lib/clipboard.js';
		import { resolveOviCoordinate } from './lib/coordinates.js';
	import { buildAnalysisPoints, buildRoute, isValidCoordinate, normalizeRoutePointNames, renameRoutePointName, samplePolyline } from './lib/route.js';
		import { createMemoryCache, isWindyRateLimit, mapWithConcurrency, withWindyRequestLimit } from './lib/async.js';
		import { altitudeAfterSliderKey, altitudeAtChartX, altitudeTrendValueAt, assessCloudAtHeight, attachRequestedModel, buildAltitudeTrend, buildCrossSectionGeometry, buildProfileDiagnosticSummary, buildRouteFreezingMarks, buildRoutePrecipitationGeometry, buildRouteTargetLine, buildRouteTargetSummaries, buildRouteTerrainOverlay, buildVerticalChartPoints, closestTimeIndex, directCloudLayerBands, forecastIntervalHours, formatForecastTime, formatWindDirection, windFlowRotationDeg, frameAtTimestamp, freezingLevelCrossings, hasTrendableVerticalProfile, humidityCloudBands, interpolateAtHeight, levelsIncludingModelSurface, nearestForecastTimestamp, nearestUsableProfileLevel, parseWindyLegacyProfile, parseWindyProfile, potentialIcingLevels, profileMatchesRequestedModel, profileProvenance, resolveTerrainElevation, sampleAltitudeRange, summarizeRouteSurfaceWindGust, visibleProfileLevels } from './lib/profile.js';
		import { distanceToDisplay, distanceUnit, heightFromDisplay, heightToDisplay, heightUnit, parseAltitudeList, precipitationToDisplay, precipitationUnit, temperatureFromDisplay, temperatureToDisplay, temperatureUnit, windFromDisplay, windToDisplay, windUnit } from './lib/units.js';

	type ForecastModel = 'ecmwf' | 'icon';
	type RoutePoint = { id: string; name: string; nameSource?: 'automatic' | 'custom'; lat: number; lon: number };
	type TerrainPoint = { lat: number; lon: number; distanceM: number; elevationM: number | null };
	type WeatherProfile = (ReturnType<typeof parseWindyProfile> | ReturnType<typeof parseWindyLegacyProfile>) & { dataSource?: string; verticalDataNotice?: string; servedModelSource?: 'response' | 'request' | 'unknown'; diagnosticAlternates?: WeatherProfile[] };
	type RouteWeatherSample = { key: string; id?: string; name: string; lat: number; lon: number; distanceM: number; terrainElevationM: number | null; profile: WeatherProfile | null; diagnosticProfile?: WeatherProfile | null; error?: string };

	const elevationCache = new Map<string, number | null>();
	const weatherProfileCache = createMemoryCache({ ttlMs: 5 * 60_000, maxEntries: 96 });
	let selectedModel: ForecastModel = 'ecmwf';
	let unitSystem: 'metric' | 'imperial' = 'metric';
	let forecastContextReady = false;
	let selectionMode: 'point' | 'route' | 'observation' = 'observation';
	let observationPanel: any;
	let observationLayer: any;
	let observationMapFrame: number | null = null;
	let observationMapDetail: any = null;
	let observationMapKey = '';
	async function observationElevation(point: {lat:number;lon:number}, signal: AbortSignal) {
		const key = elevationRequestKey(point);
		if (elevationCache.has(key)) return elevationCache.get(key) ?? null;
		const value = payloadNumber(await withWindyRequestLimit(s => getElevation(point.lat, point.lon, { abortSignal:s }), key, signal));
		if (!signal.aborted && value !== null) elevationCache.set(key,value);
		return value;
	}
	async function observationWeather(point: {lat:number;lon:number}, model: ForecastModel, signal: AbortSignal) {
		return loadWeatherProfile(point, model, 'multiload', 1, signal);
	}
	function drawObservationMap(event: CustomEvent) {
		observationMapDetail = event.detail;
		if (observationMapFrame !== null) return;
		observationMapFrame = requestAnimationFrame(() => { observationMapFrame = null; renderObservationMap(observationMapDetail); });
	}
	function renderObservationMap(detail: any) {
		if (!observationLayer) return;
		const key = JSON.stringify([detail.clear, detail.camera, detail.peak, detail.radiusM, detail.selectedSector, detail.focusPoint, (detail.result?.sectors ?? []).map((s:any)=>[s.id,s.status,s.cloud?.status,s.sight?.path?.length]), (detail.result?.solarPaths ?? []).map((s:any)=>[s.sectorId,s.timestampMs,s.status])]);
		if (key === observationMapKey) return;
		observationMapKey = key;
		observationLayer.clearLayers();
		const {camera,peak,radiusM,result,selectedSector,clear,focusPoint} = detail;
		if (clear) return;
		for (const [point,label] of [[camera,'机位'],[peak,'山峰']]) {
			if (!point) continue;
			const name = document.createElement('span');name.textContent=`${label} · ${point.name ?? label}`;
			L.circleMarker([point.lat,point.lon],{radius:7,color:'#244953',fillColor:label==='机位'?'#a4d5c3':'#eeb66d',fillOpacity:1}).bindTooltip(name,{permanent:true}).addTo(observationLayer);
		}
		if (peak) L.circle([peak.lat,peak.lon],{radius:radiusM,color:'#82c2b6',weight:1,fillOpacity:0.05}).addTo(observationLayer);
		if (camera && peak) L.polyline([[camera.lat,camera.lon],[peak.lat,peak.lon]],{color:'#eeb66d',weight:2}).addTo(observationLayer);
		for (const sector of result?.sectors ?? []) {
			for (const cell of sector.cells ?? []) {
				const corners = [315,45,135,225].map(angle => destination(cell, angle, radiusM / 8 * Math.SQRT2));
				L.polygon(corners.map(p=>[p.lat,p.lon]),{color:sector.status==='blocked'?'#eeb66d':'#82c2b6',weight:0.5,fillOpacity:sector.id===selectedSector?0.22:0.06,interactive:false}).addTo(observationLayer);
			}
			const p=sector.representative;if(!p)continue;
			const label=document.createElement('span');label.textContent=`分区 ${sector.id+1} · ${sector.status==='blocked'?'遮挡信号':sector.status==='clear'?'采样通视':'资料不足'}`;
			L.circleMarker([p.lat,p.lon],{radius:selectedSector===sector.id?9:4,color:sector.status==='blocked'?'#eeb66d':'#82c2b6',fillOpacity:0.8}).bindTooltip(label).addTo(observationLayer);
			if (sector.id===selectedSector && sector.sight?.path) L.polyline(sector.sight.path.map((v:any)=>[v.lat,v.lon]),{color:'#a4d5c3',weight:3}).addTo(observationLayer);
		}
		for (const path of result?.solarPaths ?? []) L.polyline(path.points.map((v:any)=>[v.lat,v.lon]),{color:'#eeb66d',weight:1,dashArray:'5 5'}).addTo(observationLayer);
		if (focusPoint && isValidCoordinate(focusPoint)) {
			const label=document.createElement('span');label.textContent='相关遮挡／净空证据点';
			L.circleMarker([focusPoint.lat,focusPoint.lon],{radius:10,color:'#eeb66d',weight:3}).bindTooltip(label,{permanent:true}).addTo(observationLayer);
			map.panTo([focusPoint.lat,focusPoint.lon]);
		}
	}
	let selectedPoint: RoutePoint | null = null;
	let manualCoordinateText = '';
	let coordinateProvenance = '';
	let coordinateError = '';
	let pointElevationM: number | null = null;
	let pointElevationError = '';
	let pointElevationLoading = false;
	let manualPeakElevationM: number | null = null;
	let manualPeakElevationError = '';
	let pointProfile: WeatherProfile | null = null;
	let pointProfileLoading = false;
	let pointProfileError = '';
	let pointProfileSummaryCopyStatus = '';
	let pointProfileSummaryText = '';
	let pointProfileSummaryTextarea: HTMLTextAreaElement | null = null;
	let activePointProfileRun = 0;
	let pointRequestController: AbortController | null = null;
	let profileViewer: 'point' | 'route' | null = null;
	let profileViewerElement: HTMLDivElement | null = null;
	let profileViewerCloseButton: HTMLButtonElement | null = null;
	let profileViewerTrigger: HTMLElement | null = null;
	let profileViewerEnteredFullscreen = false;
	let forecastStep: 1 | 3 = 3;
	const requestedForecastDays = 15;
	let targetAltitudeM = 5_000;
	let trendChartWidth = 720;
	let routeChartWidth = 640;
	let routeChartHeight = 640;
	let activeTrendPointerId: number | null = null;
	let activeRouteAltitudePointerId: number | null = null;
	let routePointerReadout: { sampleIndex: number; altitudeM: number } | null = null;
	let routePointerFrame: number | null = null;
	let pendingRoutePointer: { sampleIndex: number; altitudeM: number; dragging: boolean } | null = null;
	let profileRangeStartM: number | null = null;
	let profileRangeEndM: number | null = null;
	let profileRangeStepM = 250;
	let profileRangeStepError = '';
	let multiAltitudeInput = '';
	let multiAltitudeInputError = '';
	let multiAltitudeHeightsM: number[] = [];
	let routeWeatherSamples: RouteWeatherSample[] = [];
	let routeWeatherTimesMs: number[] = [];
	let routeWeatherLoading = false;
	let routeWeatherProgress = 0;
	let routeWeatherError = '';
	let routeDiagnosticSummaryCopyStatus = '';
	let routeDiagnosticSummaryText = '';
	let routeDiagnosticSummaryTextarea: HTMLTextAreaElement | null = null;
	let activeRouteWeatherRun = 0;
	let routeWeatherRequestController: AbortController | null = null;
	let routeFocusedIndex = 0;
	let routeDisplayVariable: 'cloud' | 'thickness' | 'humidity' | 'temperature' | 'wind' = 'cloud';
	let selectedForecastTimestampMs: number | null = null;
	let windyTimestampMs: number | null = null;
	let timestampListenerId: number | null = null;
	let productListenerId: number | null = null;
	let routePoints: RoutePoint[] = [];
	let analysisCount = 5;
	let routeSamplingMode: 'spacing' | 'count' = 'spacing';
	let routeWeatherSpacingM = 5_000;
	let routeContinuousClouds = true;
	let terrainSamples: TerrainPoint[] = [];
	let terrainLoading = false;
	let terrainProgress = 0;
	let terrainTotal = 0;
	let terrainError = '';
	let activeTerrainRun = 0;
	let terrainRequestController: AbortController | null = null;
	let routeLayer: any = null;
	const profileTrendMetrics = [
		{ field: 'temperatureC', title: '温度', unit: '℃', color: '#ef6f8d', digits: 1 },
		{ field: 'relativeHumidityPct', title: '相对湿度', unit: '%', color: '#65b8ed', digits: 0 },
		{ field: 'windSpeedMs', title: '风速', unit: '米/秒', color: '#ffc629', digits: 1 },
		{ field: 'cloudPct', title: '云量', unit: '%', color: '#a188ef', digits: 0 },
	] as const;
	$: builtRoute = buildRoute(routePoints);
	$: routeDistanceM = builtRoute.length > 1 ? builtRoute.at(-1).distanceM : 0;
	$: terrainSamplesByCoordinate = new Map(terrainSamples.map(point => [requestCoordinateKey(point), point]));
	$: routeWeatherGridCount = routeSamplingMode === 'spacing' ? Math.min(61, Math.max(2, Math.ceil(routeDistanceM / routeWeatherSpacingM) + 1)) : analysisCount;
	$: routeWeatherGridSpacingM = routeDistanceM / Math.max(1, routeWeatherGridCount - 1);
	$: analysisPoints = buildAnalysisPoints(routePoints, routeWeatherGridCount);
	$: profileTimeOptions = selectionMode === 'point' ? pointProfile?.timestampsMs ?? [] : routeWeatherTimesMs;
	$: profileTimeIndex = closestTimeIndex(profileTimeOptions, selectedForecastTimestampMs ?? windyTimestampMs ?? Date.now());
	$: effectiveForecastTimestampMs = profileTimeIndex >= 0 ? profileTimeOptions[profileTimeIndex] : null;
	$: viewerSourceProfile = profileViewer === 'point' ? pointProfile
		: focusedRouteSample?.profile?.ok ? focusedRouteSample.profile
			: routeWeatherSamples.find(sample => sample.profile?.ok)?.profile ?? null;
	$: viewerProvenance = profileProvenance(viewerSourceProfile);
	$: actualForecastIntervalHours = forecastIntervalHours(viewerSourceProfile?.timestampsMs ?? profileTimeOptions, effectiveForecastTimestampMs ?? Number.NaN);
	$: precipitationIntervalLabel = actualForecastIntervalHours === null ? '未知有效时段'
		: `${formatValue(actualForecastIntervalHours, Number.isInteger(actualForecastIntervalHours) ? 0 : 1, '')} 小时`;
	$: activePointFrame = frameAtTimestamp(pointProfile?.frames, effectiveForecastTimestampMs);
	$: resolvedPointTerrain = resolveTerrainElevation(pointElevationM, pointProfile?.modelElevationM ?? null, manualPeakElevationM);
	$: pointTerrainM = resolvedPointTerrain.heightM;
	$: pointTerrainSource = resolvedPointTerrain.source === 'manual' ? '手动峰顶海拔' : resolvedPointTerrain.source === 'windy' ? 'Windy 地形接口' : '模式地形';
	$: pointChartGeometry = buildVerticalChartPoints(levelsIncludingModelSurface(activePointFrame), pointTerrainM, 9_000, 360, 270);
	$: pointChartModelLevels = activePointFrame?.levels.filter(level => level.heightM >= 0 && level.heightM <= 9_000) ?? [];
	$: pointChartGroundLevels = pointChartModelLevels.filter(level => !Number.isFinite(pointTerrainM) || level.heightM >= pointTerrainM);
	$: pointCloudDetectionMaxM = Math.max(9_000, Math.min(20_000, ...(activePointFrame?.levels.map(level => level.heightM).filter(Number.isFinite) ?? [9_000])));
	$: pointHumidityBands = humidityCloudBands(activePointFrame, pointTerrainM, pointCloudDetectionMaxM);
	$: pointDirectCloudBands = directCloudLayerBands(activePointFrame, pointTerrainM);
	$: pointTargetAltitudeMsl = Number(targetAltitudeM);
	$: targetHeightResult = activePointFrame ? interpolateAtHeight(activePointFrame, pointTargetAltitudeMsl, pointTerrainM) : null;
	$: pointGroundLevels = activePointFrame?.levels.filter(level => !Number.isFinite(pointTerrainM) || level.heightM >= pointTerrainM) ?? [];
	$: pointNearestUsableLevel = nearestUsableProfileLevel(levelsIncludingModelSurface(activePointFrame), pointTargetAltitudeMsl, pointTerrainM, 9_000);
	$: pointTargetInPossibleCloud = pointHumidityBands.find(band => pointTargetAltitudeMsl !== null && pointTargetAltitudeMsl >= band.lowHeightM && pointTargetAltitudeMsl <= band.highHeightM) ?? null;
	$: pointCloudAssessment = assessCloudAtHeight(targetHeightResult, pointHumidityBands, pointTargetAltitudeMsl, activePointFrame?.cloudBaseM, unitSystem);
	$: pointPotentialIcingLevels = potentialIcingLevels(activePointFrame, pointTerrainM);
	$: pointFreezingLevels = freezingLevelCrossings(activePointFrame, pointTerrainM, 9_000);
	$: pointHasGroupedClouds = [activePointFrame?.lowCloudPct, activePointFrame?.mediumCloudPct, activePointFrame?.highCloudPct].some(value => Number.isFinite(value));
	$: pointCoverageMinM = pointGroundLevels.length ? Math.min(...pointGroundLevels.map(level => level.heightM)) : 0;
	$: pointCoverageMaxM = pointGroundLevels.length ? Math.max(...pointGroundLevels.map(level => level.heightM)) : 0;
	$: profileRangeStartDefaultM = pointGroundLevels.length ? Math.ceil(pointCoverageMinM / 250) * 250 : 0;
	$: profileRangeEndDefaultM = pointGroundLevels.length ? Math.min(9_000, Math.floor(pointCoverageMaxM / 250) * 250) : 0;
	$: profileRangeStartValueM = profileRangeStartM ?? profileRangeStartDefaultM;
	$: profileRangeEndValueM = profileRangeEndM ?? profileRangeEndDefaultM;
	$: profileRangeValid = profileRangeStartValueM <= profileRangeEndValueM;
	$: profileRangeRows = activePointFrame && pointGroundLevels.length && profileRangeValid ? sampleAltitudeRange(profileRangeStartValueM, profileRangeEndValueM, profileRangeStepM).map(heightM => ({ heightM, values: interpolateAtHeight(activePointFrame, heightM, pointTerrainM) })) : [];
	$: pointHasLevelsAboveChart = Boolean(activePointFrame?.levels.some(level => level.heightM > 9_000));
	$: pointTrendCharts = profileTrendMetrics.map(metric => ({
		...metric,
		geometry: buildAltitudeTrend(levelsIncludingModelSurface(activePointFrame), metric.field, pointTerrainM, 9_000, trendChartWidth, 320),
	}));
	$: pointTrendStatus = pointTrendCharts.some(({ geometry }) => geometry?.segments.some(segment => segment.length >= 2)) ? '' : (() => {
		const counts = pointTrendCharts.map(({ title, geometry }) => `${title} ${geometry?.points.length ?? 0} 层`).join('，');
		const terrainInfo = Number.isFinite(pointTerrainM)
			? `气压高度层共 ${pointChartModelLevels.length} 层，地形以上 ${pointChartGroundLevels.length} 层、地形以下 ${pointChartModelLevels.length - pointChartGroundLevels.length} 层。`
			: `当前无法确认地形高度；气压高度层共 ${pointChartModelLevels.length} 层。`;
		const surfaceInfo = activePointFrame?.surfaceLevel
			? `另有模式地形 ${formatHeight(Number(pointProfile?.modelElevationM), 0, unitSystem)} 处的近地面温度或风值；它不提供垂直湿度和云量。`
			: '';
		const queryInfo = targetHeightResult?.reason === 'below-terrain'
			? `查询海拔 ${formatHeight(pointTargetAltitudeMsl ?? Number.NaN, 0, unitSystem)}低于地形 ${formatHeight(Number(pointTerrainM), 0, unitSystem)}，因此该高度没有有效天气值；将图中查询线拖到地形以上的有效高度层，才能读取对应数值。`
			: '';
		return `${terrainInfo}${surfaceInfo}${queryInfo}各变量地形以上的有效值：${counts}。少于两个相邻有效值，或中间有缺测／层间断档时不连线；不补造或外推。`;
	})();
	$: multiAltitudeRows = activePointFrame ? multiAltitudeHeightsM.map(heightM => ({
		heightM,
		values: interpolateAtHeight(activePointFrame, heightM, pointTerrainM),
	})) : [];
	$: routeEstimatedCoverage = routeContinuousClouds && (routeDisplayVariable === 'cloud' || routeDisplayVariable === 'thickness');
	$: crossSectionGeometry = buildCrossSectionGeometry(routeWeatherSamples, effectiveForecastTimestampMs ?? Number.NaN, routeDisplayVariable, 9_000, routeChartWidth, routeChartHeight, routeEstimatedCoverage ? 'nearest' : 'samples');
	$: routeFreezingMarks = buildRouteFreezingMarks(routeWeatherSamples, effectiveForecastTimestampMs ?? Number.NaN, crossSectionGeometry);
	$: routeTargetLine = buildRouteTargetLine(routeWeatherSamples, crossSectionGeometry, Number(targetAltitudeM));
	$: routeTerrainSourceSamples = terrainSamples.filter(point => Number.isFinite(point.distanceM)).length >= 2
		? terrainSamples
		: routeWeatherSamples.map(sample => ({ ...sample, elevationM: Number.isFinite(sample.terrainElevationM) ? sample.terrainElevationM : sample.profile?.modelElevationM ?? null }));
	$: routeTerrainOverlay = buildRouteTerrainOverlay(routeTerrainSourceSamples, crossSectionGeometry);
	$: routeWindMarks = routeWeatherSamples.flatMap((sample, sampleIndex) => {
		const frame = frameAtTimestamp(sample.profile?.frames, effectiveForecastTimestampMs);
		const terrain = Number.isFinite(sample.terrainElevationM) ? sample.terrainElevationM : sample.profile?.modelElevationM ?? null;
		const sampleTargetAltitudeMsl = Number(targetAltitudeM);
		const value = interpolateAtHeight(frame, sampleTargetAltitudeMsl, terrain);
		const mark = crossSectionGeometry.sampleMarks[sampleIndex];
		return mark && Number.isFinite(value.windDirectionDeg) && sampleTargetAltitudeMsl !== null && sampleTargetAltitudeMsl >= 0 && sampleTargetAltitudeMsl <= 9_000
			? [{ sampleIndex, x: mark.x, y: crossSectionGeometry.y(sampleTargetAltitudeMsl), directionDeg: value.windDirectionDeg, speedMs: value.windSpeedMs, name: sample.name }]
			: [];
	});
	$: routePrecipitation = routeWeatherSamples.map(sample => {
		const frame = frameAtTimestamp(sample.profile?.frames, effectiveForecastTimestampMs);
		return { key: sample.key, name: sample.name, distanceM: sample.distanceM, amountMm: frame?.precipAmountMm ?? null, snowMm: frame?.precipSnowAmountMm ?? null };
	});
	$: routePrecipitationGeometry = buildRoutePrecipitationGeometry(routePrecipitation, crossSectionGeometry, routeChartWidth, 120);
	$: routeSurfaceGustSummary = summarizeRouteSurfaceWindGust(routeWeatherSamples, effectiveForecastTimestampMs ?? Number.NaN);
	$: routeComparisonSamplesByKey = new Map(routeWeatherSamples.map(sample => [sample.key, sample]));
	$: routeComparisonInputs = analysisPoints.map((point, index) => {
		const key = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
		const loaded = routeComparisonSamplesByKey.get(key);
		return loaded
			? { ...loaded, name: point.name ?? loaded.name }
			: { key, ...point, name: point.name ?? `分析点 ${index + 1}`, profile: null, terrainElevationM: null, error: routeWeatherError || null };
	});
	$: routeComparisonRows = buildRouteTargetSummaries(routeComparisonInputs, effectiveForecastTimestampMs ?? Number.NaN, Number(targetAltitudeM), unitSystem);
	$: focusedRouteSample = routeWeatherSamples[routeFocusedIndex] ?? null;
	$: focusedRouteFrame = frameAtTimestamp(focusedRouteSample?.profile?.frames, effectiveForecastTimestampMs);
	$: focusedRouteTerrainM = Number.isFinite(focusedRouteSample?.terrainElevationM) ? focusedRouteSample.terrainElevationM : focusedRouteSample?.profile?.modelElevationM ?? null;
	$: focusedRouteHumidityBands = humidityCloudBands(focusedRouteFrame, focusedRouteTerrainM, 9_000);
	$: focusedRouteDirectCloudBands = directCloudLayerBands(focusedRouteFrame, focusedRouteTerrainM);
	$: focusedRouteTargetAltitudeMsl = Number(targetAltitudeM);
	$: focusedRouteNearestUsableLevel = nearestUsableProfileLevel(levelsIncludingModelSurface(focusedRouteFrame), focusedRouteTargetAltitudeMsl, focusedRouteTerrainM, 9_000);
	$: focusedRouteTargetInPossibleCloud = focusedRouteHumidityBands.find(band => focusedRouteTargetAltitudeMsl !== null && focusedRouteTargetAltitudeMsl >= band.lowHeightM && focusedRouteTargetAltitudeMsl <= band.highHeightM) ?? null;
	$: focusedRouteTerrainSource = Number.isFinite(focusedRouteSample?.terrainElevationM) ? 'Windy 地形接口' : '模式地形';
	$: focusedRouteLevels = levelsIncludingModelSurface(focusedRouteFrame).filter(level => level.heightM <= 9_000
		&& (!Number.isFinite(focusedRouteTerrainM) || level.heightM >= focusedRouteTerrainM));
	$: focusedRouteTrendMetrics = [
		{ field: 'temperatureC', title: '温度', color: '#db7181', digits: 1 },
		{ field: 'relativeHumidityPct', title: '相对湿度', color: '#6eb8ec', digits: 0 },
		{ field: 'windSpeedMs', title: '风速', color: '#f0c343', digits: 1 },
		{ field: 'cloudPct', title: '云量', color: '#a18bf2', digits: 0 },
	].map(metric => ({
		...metric,
		geometry: buildAltitudeTrend(levelsIncludingModelSurface(focusedRouteFrame), metric.field, focusedRouteTerrainM, 9_000, trendChartWidth, 320),
	}));
	$: focusedRouteTargetResult = focusedRouteFrame ? interpolateAtHeight(focusedRouteFrame, focusedRouteTargetAltitudeMsl, focusedRouteTerrainM) : null;
	$: routeReadoutSample = routeWeatherSamples[routePointerReadout?.sampleIndex ?? routeFocusedIndex] ?? null;
	$: routeReadoutAltitudeM = routePointerReadout?.altitudeM ?? Number(targetAltitudeM);
	$: routeReadoutTerrainM = Number.isFinite(routeReadoutSample?.terrainElevationM) ? routeReadoutSample?.terrainElevationM : routeReadoutSample?.profile?.modelElevationM ?? null;
	$: routeReadoutFrame = frameAtTimestamp(routeReadoutSample?.profile?.frames, effectiveForecastTimestampMs);
	$: routeReadoutWeather = routeReadoutFrame ? interpolateAtHeight(routeReadoutFrame, routeReadoutAltitudeM, routeReadoutTerrainM) : null;
	$: routeReadoutNotice = !routeReadoutFrame ? '该点当前时次暂无天气数据' : routeReadoutWeather?.reason === 'below-terrain' ? '此海拔低于该点地形，没有可用天气值' : !routeReadoutWeather?.ok ? '此海拔没有有效层包围，不能外推；缺测不代表无云' : '数值来自该采样点；层间插值不是现场实测，点间云区仍为估算';
	$: focusedRouteCloudAssessment = assessCloudAtHeight(focusedRouteTargetResult, focusedRouteHumidityBands, focusedRouteTargetAltitudeMsl, focusedRouteFrame?.cloudBaseM, unitSystem);
	$: focusedRoutePotentialIcingLevels = potentialIcingLevels(focusedRouteFrame, focusedRouteTerrainM);
	$: focusedRouteFreezingLevels = freezingLevelCrossings(focusedRouteFrame, focusedRouteTerrainM, 9_000);
	$: focusedRouteHasGroupedClouds = [focusedRouteFrame?.lowCloudPct, focusedRouteFrame?.mediumCloudPct, focusedRouteFrame?.highCloudPct].some(value => Number.isFinite(value));
	$: routeMetricLabel = ({ cloud: '模式云量（%）', thickness: `云层厚度估算（${heightUnit(unitSystem)}）`, humidity: '相对湿度（%）', temperature: `温度（${temperatureUnit(unitSystem)}）`, wind: `风速（${windUnit(unitSystem)}）` })[routeDisplayVariable];
	$: routeLegendSteps = buildRouteLegendSteps(routeDisplayVariable, unitSystem);
	const profileAltitudeTicks = [0, 3_000, 6_000, 9_000];
	const profileIncludes = { header: true, celestial: true, summary: true, meteogram: true, airgram: true, sounding: true };
	function requestCoordinateKey(point: { lat: number; lon: number }) {
		return `${point.lat.toFixed(7)},${point.lon.toFixed(7)}`;
	}

	function routeWaypointTerrainLabel(point: RoutePoint) {
		const sample = terrainSamplesByCoordinate.get(requestCoordinateKey(point));
		if (sample && Number.isFinite(sample.elevationM)) return `Windy 地形 ${formatHeight(sample.elevationM, 0, unitSystem)}`;
		if (sample) return 'Windy 地形缺测';
		if (terrainLoading) return '地形读取中…';
		if (terrainProgress > 0 && terrainProgress < terrainTotal) return '地形未完整读取';
		return terrainSamples.length ? '该点地形缺测' : '地形未读取';
	}
	function pointForecastRequestKey(model: ForecastModel, source: 'detail' | 'multiload', point: { lat: number; lon: number }, step = forecastStep) {
		return `forecast:${model}:${source}:${step}:${requestedForecastDays}:${requestCoordinateKey(point)}`;
	}
	function elevationRequestKey(point: { lat: number; lon: number }) {
		return `elevation:${requestCoordinateKey(point)}`;
	}

	function abortIfNeeded(signal: AbortSignal) {
		if (!signal.aborted) return;
		const error = new Error('Windy 请求已取消');
		error.name = 'AbortError';
		throw error;
	}

	async function fetchWeatherProfile(point: { lat: number; lon: number }, model: ForecastModel, source: 'detail' | 'multiload', step: 1 | 3, signal: AbortSignal): Promise<WeatherProfile> {
		let currentProfile: WeatherProfile | null = null;
		let currentError = '';
		try {
			const payload = await withWindyRequestLimit(requestSignal => getPointForecastData(model, {
				lat: point.lat,
				lon: point.lon,
				days: requestedForecastDays,
				step,
				source,
			}, profileIncludes, { abortSignal: requestSignal }), pointForecastRequestKey(model, source, point, step), signal);
			const parsedProfile = parseWindyProfile(payload);
			currentProfile = attachRequestedModel({
				...parsedProfile,
				requestedIncludes: Object.entries(profileIncludes)
					.filter(([, enabled]) => enabled)
					.map(([name]) => name),
			}, model);
			if (currentProfile.error && isWindyRateLimit(new Error(currentProfile.error))) throw new Error(currentProfile.error);
		} catch (error) {
			if ((error as Error)?.name === 'AbortError' || isWindyRateLimit(error)) throw error;
			currentError = error instanceof Error ? error.message : String(error);
		}
		if (hasTrendableVerticalProfile(currentProfile) && modelMatchesSelection(currentProfile, model)) return currentProfile;
		abortIfNeeded(signal);

		try {
			const legacyPayload = await withWindyRequestLimit(requestSignal => getMeteogramForecastData(model, {
				lat: point.lat,
				lon: point.lon,
				step,
			}, undefined, { abortSignal: requestSignal }), `forecast-legacy:${model}:${source}:${step}:${requestCoordinateKey(point)}`, signal);
			const legacyProfile = attachRequestedModel(parseWindyLegacyProfile(legacyPayload, model), model);
			if (legacyProfile.error && isWindyRateLimit(new Error(legacyProfile.error))) throw new Error(legacyProfile.error);
			if (legacyProfile.servedModel && !modelMatchesSelection(legacyProfile, model)) {
				const retained = currentProfile && modelMatchesSelection(currentProfile, model) ? currentProfile : legacyProfile;
				return {
					...retained,
					diagnosticAlternates: retained === currentProfile ? [legacyProfile] : currentProfile ? [currentProfile] : [],
					verticalDataNotice: `Windy 旧版兼容逐层接口（官方标记弃用）标注的模式与当前所选 ${model.toUpperCase()} 不一致，已丢弃该响应。`,
				};
			}
			if (hasTrendableVerticalProfile(legacyProfile) && modelMatchesSelection(legacyProfile, model)) {
				return {
					...legacyProfile,
					diagnosticAlternates: currentProfile ? [currentProfile] : [],
					verticalDataNotice: '数据来自 Windy 保留的旧版兼容接口（官方已标记弃用）；这里只使用接口返回的真实位势高度，至少有两个相邻有效层时才画线，不补造或外推。',
				};
			}
			const retained = currentProfile && modelMatchesSelection(currentProfile, model) ? currentProfile : legacyProfile;
			const currentReason = currentError ? `新版接口读取失败：${currentError}。`
				: currentProfile?.servedModelSource === 'response' && !modelMatchesSelection(currentProfile, model)
					? `新版接口明确返回 ${currentProfile.servedModel}，与请求的 ${model.toUpperCase()} 不同；该响应已丢弃。`
					: currentProfile?.hasVerticalLayers ? '新版接口返回的有效高度层不足以形成趋势线。' : '新版接口没有返回垂直高度层。';
			return {
				...retained,
				diagnosticAlternates: [currentProfile, legacyProfile].filter((profile): profile is WeatherProfile => Boolean(profile && profile !== retained)),
				verticalDataNotice: `${currentReason}Windy 旧版兼容逐层接口（官方标记弃用）也没有返回足够的有效高度层，图表仅显示实际收到的数值。`,
				error: retained.ok ? retained.error : `${currentReason}${legacyProfile.error}`,
			};
		} catch (error) {
			if ((error as Error)?.name === 'AbortError' || isWindyRateLimit(error)) throw error;
			const fallbackReason = error instanceof Error ? error.message : String(error);
			if (currentProfile && modelMatchesSelection(currentProfile, model)) return { ...currentProfile, verticalDataNotice: `${currentProfile.hasVerticalLayers ? '新版接口返回的高度层不足以连线' : '新版接口没有返回垂直高度层'}；Windy 旧版兼容接口（官方标记弃用）读取失败：${fallbackReason}` };
			if (currentProfile?.servedModelSource === 'response' && !modelMatchesSelection(currentProfile, model)) {
				return {
					...currentProfile,
					ok: false,
					error: 'Windy 新版接口返回模式与请求模式不一致',
					verticalDataNotice: `请求 ${model.toUpperCase()}，Windy 新版接口明确返回 ${currentProfile.servedModel}；旧版兼容逐层接口（官方标记弃用）读取失败：${fallbackReason}`,
				};
			}
			throw currentError ? new Error(`${currentError}；Windy 旧版兼容逐层接口（官方标记弃用）读取失败：${fallbackReason}`) : error;
		}
	}

	async function loadWeatherProfile(point: { lat: number; lon: number }, model: ForecastModel, source: 'detail' | 'multiload', step: 1 | 3, signal: AbortSignal): Promise<WeatherProfile> {
		abortIfNeeded(signal);
		const cacheKey = pointForecastRequestKey(model, source, point, step);
		const cached = weatherProfileCache.get(cacheKey);
		if (cached) return cached;
		const profile = await fetchWeatherProfile(point, model, source, step, signal);
		abortIfNeeded(signal);
		if (profile.ok && (!profile.servedModel || modelMatchesSelection(profile, model))) weatherProfileCache.set(cacheKey, profile);
		return profile;
	}

	function closePlugin() {
		observationPanel?.cancel();
		broadcast.emit('rqstOpen', 'menu');
	}

	function openProfileViewer(mode: 'point' | 'route', event?: MouseEvent) {
		if (event?.currentTarget instanceof HTMLElement) profileViewerTrigger = event.currentTarget;
		profileViewer = mode;
		void tick().then(() => {
			profileViewerCloseButton?.focus();
			const viewer = profileViewerElement;
			if (profileViewer !== mode || !viewer || document.fullscreenElement || typeof viewer.requestFullscreen !== 'function') return;
			void viewer.requestFullscreen().then(() => {
				profileViewerEnteredFullscreen = true;
			}).catch(() => {
				profileViewerEnteredFullscreen = false;
			});
		});
	}

	function closeProfileViewer() {
		resetRoutePointerInteraction();
		profileViewer = null;
		if (document.fullscreenElement === profileViewerElement && typeof document.exitFullscreen === 'function') {
			void document.exitFullscreen().catch(() => {});
		}
		const trigger = profileViewerTrigger;
		profileViewerTrigger = null;
		void tick().then(() => trigger?.focus());
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (!profileViewer || !profileViewerElement) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			closeProfileViewer();
			return;
		}
		if (event.key !== 'Tab') return;
		const focusable = [...profileViewerElement.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')];
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable.at(-1);
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last?.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		} else if (!profileViewerElement.contains(document.activeElement)) {
			event.preventDefault();
			first.focus();
		}
	}

	function handleFullscreenChange() {
		if (!profileViewerEnteredFullscreen || document.fullscreenElement === profileViewerElement) return;
		profileViewerEnteredFullscreen = false;
		if (profileViewer) closeProfileViewer();
	}

	function extractCoordinate(event: unknown): { lat: number; lon: number } | null {
		const source = event && typeof event === 'object' ? event as Record<string, any> : {};
		const candidates = [source, source.latLon, source.latlon, source.latLng, source.latlng, source.coords, source.detail, source.originalEvent];
		for (const candidate of candidates) {
			if (!candidate || typeof candidate !== 'object') continue;
			const lat = Number(candidate.lat ?? candidate.latitude);
			const lon = Number(candidate.lon ?? candidate.lng ?? candidate.longitude);
			if (isValidCoordinate({ lat, lon })) return { lat, lon };
		}
		return null;
	}

	function handleMapClick(event: unknown) {
		const coordinate = extractCoordinate(event);
		if (!coordinate) return;
		if (selectionMode === 'observation') { observationPanel?.acceptMapPoint(coordinate); return; }
		if (selectionMode === 'point') {
			selectPoint({ id: `map-${Date.now()}`, name: '地图选点', ...coordinate }, 'Windy 地图坐标，按原值使用');
			return;
		}
		resetRouteWeather();
		if (routePoints.length >= 2) {
			const previous = routePoints.at(-1);
			routePoints = [...routePoints.slice(0, -1), { ...previous, name: `转折点 ${routePoints.length - 1}` }];
		}
		cancelTerrain();
		routePoints = normalizeRoutePointNames([...routePoints, { id: `route-${Date.now()}-${routePoints.length}`, name: '', nameSource: 'automatic', ...coordinate }]);
		terrainSamples = [];
		terrainError = '';
	}

	function handleWaypointNameChange(pointId: string, event: Event) {
		routePoints = renameRoutePointName(routePoints, pointId, (event.currentTarget as HTMLInputElement).value);
		const point = routePoints.find(candidate => candidate.id === pointId);
		if (!point) return;
		const key = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
		routeWeatherSamples = routeWeatherSamples.map(sample => sample.key === key ? { ...sample, name: point.name } : sample);
	}

	function useOviCoordinate() {
		const resolved = resolveOviCoordinate(manualCoordinateText);
		if (!resolved.ok) {
			coordinateError = resolved.error;
			return;
		}
		selectPoint({
			id: `ovi-${Date.now()}`,
			name: resolved.coordinateSystem === 'GCJ-02' ? '奥维坐标（已转换）' : '奥维坐标',
			lat: resolved.lat,
			lon: resolved.lon,
		}, resolved.source);
	}

	function setSelectionMode(mode: 'point' | 'route' | 'observation') {
		if (selectionMode === mode) return;
		if (selectionMode === 'point') cancelPointProfile();
		else {
			cancelRouteProfile();
			cancelTerrain();
		}
		selectionMode = mode;
	}

	function selectPoint(point: RoutePoint, provenance: string) {
		resetPointWeather();
		selectedPoint = point;
		manualPeakElevationM = null;
		manualPeakElevationError = '';
		coordinateProvenance = provenance;
		coordinateError = '';
		pointElevationM = null;
		pointElevationError = '';
		pointElevationLoading = false;
		profileRangeStartM = null;
		profileRangeEndM = null;
		if (forecastContextReady) void loadPointProfile();
	}

	function handleManualPeakElevation(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const valueText = input.value.trim();
		if (!valueText) {
			manualPeakElevationM = null;
			manualPeakElevationError = '';
			return;
		}
		const elevationM = heightFromDisplay(Number(valueText), unitSystem);
		if (!input.validity.valid || !Number.isFinite(elevationM) || elevationM < 0 || elevationM > 10_000) {
			manualPeakElevationError = '峰顶海拔超出允许范围';
			return;
		}
		manualPeakElevationM = elevationM;
		manualPeakElevationError = '';
	}

	function queryAtTerrainElevation() {
		if (!Number.isFinite(pointTerrainM)) return;
		targetAltitudeM = Math.round(Number(pointTerrainM));
	}

	function queryAtNearestProfileLevel() {
		if (pointNearestUsableLevel) setTargetAltitudeFromMsl(pointNearestUsableLevel.heightM);
	}

	function queryAtNearestRouteProfileLevel() {
		if (focusedRouteNearestUsableLevel) setTargetAltitudeFromMsl(focusedRouteNearestUsableLevel.heightM);
	}

	function setTargetAltitudeFromMsl(heightM: number) {
		if (!Number.isFinite(heightM)) return;
		targetAltitudeM = heightM;
	}

	function clearManualPeakElevation() {
		manualPeakElevationM = null;
		manualPeakElevationError = '';
	}

	function handleAnalysisCount(event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		const nextCount = Number.isFinite(value) ? Math.min(61, Math.max(2, Math.floor(value))) : 5;
		if (nextCount !== analysisCount) resetRouteWeather();
		analysisCount = nextCount;
	}

	function handleRouteSamplingMode(event: Event) {
		resetRouteWeather();
		routeSamplingMode = (event.currentTarget as HTMLSelectElement).value === 'count' ? 'count' : 'spacing';
	}

	function handleRouteWeatherSpacing(event: Event) {
		const spacing = Number((event.currentTarget as HTMLSelectElement).value);
		if (![2000, 5000, 10000].includes(spacing)) return;
		resetRouteWeather();
		routeWeatherSpacingM = spacing;
	}

	function drawMapItems(mode: 'point' | 'route' | 'observation', waypoints: RoutePoint[], pointSelection: RoutePoint | null) {
		if (!routeLayer) return;
		routeLayer.clearLayers();
		if (mode === 'observation') return;
		if (mode === 'route' && waypoints.length > 1) {
			L.polyline(waypoints.map(point => [point.lat, point.lon]), { color: '#82d1d5', weight: 3, opacity: 0.92, dashArray: '7 6', interactive: false }).addTo(routeLayer);
		}
		const points = mode === 'route' ? waypoints : pointSelection ? [pointSelection] : [];
		points.forEach((point, index) => {
			if (mode === 'point') {
				L.circleMarker([point.lat, point.lon], { radius: 6, color: '#152630', weight: 2, fillColor: '#a4e3e1', fillOpacity: 1, interactive: false }).addTo(routeLayer);
				return;
			}
			const endpoint = index === points.length - 1 && index > 0;
			const color = endpoint ? '#9c481b' : '#22616c';
			const badge = document.createElement('div');
			badge.style.cssText = 'position:relative;width:28px;height:28px;pointer-events:none;font:600 13px/1.3 system-ui,sans-serif;';
			const number = document.createElement('span');
			number.textContent = String(index + 1);
			number.style.cssText = `display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:28px;height:28px;border:2px solid white;border-radius:50%;background:${color};color:white;box-shadow:0 1px 5px #0006;`;
			const label = document.createElement('span');
			// User-edited names remain plain text, never HTML.
			label.textContent = point.name;
			label.style.cssText = `position:absolute;left:34px;top:2px;max-width:180px;padding:3px 7px;border:1px solid ${color};border-radius:5px;background:#fff;color:#17282e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 4px #0003;`;
			badge.append(number, label);
			L.marker([point.lat, point.lon], {
				icon: L.divIcon({ html: badge, className: 'high-altitude-route-pin', iconSize: [28, 28], iconAnchor: [14, 14] }),
				title: `${index + 1}. ${point.name}`,
				interactive: false,
				keyboard: false,
				zIndexOffset: 500,
			}).addTo(routeLayer);
		});
	}

	function formatValue(value: number | null | undefined, digits = 0, suffix = '') {
		return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : '—';
	}

	function displayHeightNumber(metres: number | null | undefined, digits = 0, system: 'metric' | 'imperial' = unitSystem) {
		const value = heightToDisplay(typeof metres === 'number' ? metres : Number.NaN, system);
		return value === null ? '' : value.toFixed(digits);
	}

	function formatHeight(metres: number | null | undefined, digits = 0, system: 'metric' | 'imperial' = unitSystem) {
		const value = heightToDisplay(typeof metres === 'number' ? metres : Number.NaN, system);
		return value === null ? '—' : `${value.toFixed(digits)} ${heightUnit(system)}`;
	}

	function freezingLevelText(result: { heightsM?: number[]; validAdjacentPairCount?: number } | null | undefined) {
		if (!result) return '暂无有效温度层';
		if (result.heightsM?.length) return result.heightsM.map(heightM => formatHeight(heightM, 0, unitSystem)).join('、');
		return result.validAdjacentPairCount ? '当前有效数据段内未发现 0°C 穿越' : '有效温度层不足';
	}

	function formatTemperature(celsius: number | null | undefined, digits = 1, system: 'metric' | 'imperial' = unitSystem) {
		const value = temperatureToDisplay(typeof celsius === 'number' ? celsius : Number.NaN, system);
		return value === null ? '—' : `${value.toFixed(digits)} ${temperatureUnit(system)}`;
	}

	function formatWind(speedMs: number | null | undefined, digits = 1, system: 'metric' | 'imperial' = unitSystem) {
		const value = windToDisplay(typeof speedMs === 'number' ? speedMs : Number.NaN, system);
		return value === null ? '—' : `${value.toFixed(digits)} ${windUnit(system)}`;
	}

	function formatDistance(metres: number | null | undefined, digits = 1, system: 'metric' | 'imperial' = unitSystem) {
		const value = distanceToDisplay(typeof metres === 'number' ? metres : Number.NaN, system);
		return value === null ? '—' : `${value.toFixed(digits)} ${distanceUnit(system)}`;
	}

	function formatVisibility(metres: number | null | undefined, system: 'metric' | 'imperial' = unitSystem) {
		if (!Number.isFinite(metres)) return '—';
		if (system === 'metric' && Number(metres) < 1_000) return `${Math.round(Number(metres))} 米`;
		return formatDistance(Number(metres), Number(metres) < 1_000 ? 2 : 1, system);
	}

	function formatPrecipitation(millimetres: number | null | undefined, digits = 1, system: 'metric' | 'imperial' = unitSystem) {
		const value = precipitationToDisplay(typeof millimetres === 'number' ? millimetres : Number.NaN, system);
		return value === null ? '—' : `${value.toFixed(system === 'imperial' ? Math.max(2, digits) : digits)} ${precipitationUnit(system)}`;
	}

	function trendUnit(field: string, system: 'metric' | 'imperial' = unitSystem) {
		return field === 'temperatureC' ? temperatureUnit(system)
			: field === 'windSpeedMs' ? windUnit(system) : '%';
	}

	function formatTrendValue(value: number | null | undefined, field: string, digits = 0, system: 'metric' | 'imperial' = unitSystem) {
		if (field === 'temperatureC') return formatTemperature(value, digits, system);
		if (field === 'windSpeedMs') return formatWind(value, digits, system);
		return formatValue(value, digits, '%');
	}

	function trendCoverageSummary(geometry: ReturnType<typeof buildAltitudeTrend> | null | undefined, field: string, digits: number) {
		if (!geometry) return '无有效数据';
		const points = geometry.points;
		if (!points.length) return geometry.referencePoints.length ? `地形以下参考 ${geometry.referencePoints.length} 点，未参与趋势` : '无有效数据';
		const heights = points.map(point => point.heightM);
		const lowHeightM = Math.min(...heights);
		const highHeightM = Math.max(...heights);
		const lineCount = geometry.segments.filter(segment => segment.length >= 2).length;
		const valueRange = lineCount
			? ` · ${formatTrendValue(geometry.domainMin, field, digits, unitSystem)}–${formatTrendValue(geometry.domainMax, field, digits, unitSystem)}`
			: '';
		const lineSummary = lineCount ? `${lineCount} 段实线` : '无连续实线';
		return `有效海拔 ${formatHeight(lowHeightM, 0, unitSystem)}–${formatHeight(highHeightM, 0, unitSystem)} · ${points.length} 点 · ${lineSummary}${valueRange}`;
	}

	function handleTargetAltitudeChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		if (!input.value.trim()) return;
		const value = heightFromDisplay(Number(input.value), unitSystem);
		const minimum = 0;
		if (value !== null && value >= minimum && value <= 20_000) targetAltitudeM = value;
	}

	function handleProfileRangeChange(event: Event, edge: 'start' | 'end') {
		const input = event.currentTarget as HTMLInputElement;
		if (!input.value.trim()) return;
		const value = heightFromDisplay(Number(input.value), unitSystem);
		if (value === null) return;
		if (edge === 'start') profileRangeStartM = Math.max(0, Math.min(9_000, value));
		else profileRangeEndM = Math.max(0, Math.min(9_000, value));
	}

	function handleProfileRangeStepChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		if (!input.value.trim()) return;
		const value = heightFromDisplay(Number(input.value), unitSystem);
		if (value === null || value < 50 || value > 2_000) {
			profileRangeStepError = `采样间隔请设为 50–${displayHeightNumber(2_000, 0, unitSystem)} ${heightUnit(unitSystem)}。`;
			return;
		}
		profileRangeStepError = '';
		profileRangeStepM = Math.round(value);
	}

	function handleMultiAltitudeInput(event: Event) {
		multiAltitudeInput = (event.currentTarget as HTMLInputElement).value;
		const parsed = parseAltitudeList(multiAltitudeInput, unitSystem);
		multiAltitudeInputError = parsed.error;
		multiAltitudeHeightsM = parsed.ok ? parsed.heightsM : [];
	}

	function clearMultiAltitudeInput() {
		multiAltitudeInput = '';
		multiAltitudeInputError = '';
		multiAltitudeHeightsM = [];
	}

	function changeUnitSystem(system: 'metric' | 'imperial') {
		if (unitSystem === system) return;
		if (multiAltitudeHeightsM.length && !multiAltitudeInputError) {
			multiAltitudeInput = multiAltitudeHeightsM
				.map(heightM => displayHeightNumber(heightM, 1, system))
				.join(', ');
		}
		unitSystem = system;
	}

	function observeTrendWidth(node: HTMLDivElement) {
		const updateWidth = () => {
			const panel = node.querySelector<HTMLElement>('.trend-panel');
			const width = panel?.getBoundingClientRect().width;
			if (Number.isFinite(width) && Number(width) > 0) trendChartWidth = Math.max(320, Math.round(Number(width)));
		};
		const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updateWidth) : null;
		observer?.observe(node);
		requestAnimationFrame(updateWidth);
		return { destroy: () => observer?.disconnect() };
	}

	function observeRouteChartWidth(node: HTMLDivElement) {
		const updateWidth = () => {
			const { width, height } = (node.querySelector('svg') ?? node).getBoundingClientRect();
			const nextWidth = Math.max(320, Math.round(width));
			const nextHeight = Math.max(320, Math.round(height));
			if (Number.isFinite(width) && width > 0 && nextWidth !== routeChartWidth) routeChartWidth = nextWidth;
			if (Number.isFinite(height) && height > 0 && nextHeight !== routeChartHeight) routeChartHeight = nextHeight;
		};
		const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updateWidth) : null;
		observer?.observe(node);
		requestAnimationFrame(updateWidth);
		return { destroy: () => observer?.disconnect() };
	}

	function setTrendAltitudeFromPointer(event: PointerEvent, geometry: { plot: { left: number; right: number }; maxHeightM: number; chartWidth?: number }) {
		const svg = (event.currentTarget as SVGRectElement).ownerSVGElement;
		const bounds = svg?.getBoundingClientRect();
		if (!bounds || bounds.width <= 0) return;
		const chartX = (event.clientX - bounds.left) / bounds.width * (geometry.chartWidth ?? 720);
		const altitudeM = altitudeAtChartX(chartX, geometry.plot, geometry.maxHeightM, 50);
		if (altitudeM !== null) setTargetAltitudeFromMsl(altitudeM);
	}

	function beginTrendDrag(event: PointerEvent, geometry: { plot: { left: number; right: number }; maxHeightM: number; chartWidth?: number }) {
		if (!event.isPrimary || event.button !== 0) return;
		event.preventDefault();
		activeTrendPointerId = event.pointerId;
		try { (event.currentTarget as SVGRectElement).setPointerCapture(event.pointerId); } catch { activeTrendPointerId = null; }
		setTrendAltitudeFromPointer(event, geometry);
	}

	function moveTrendDrag(event: PointerEvent, geometry: { plot: { left: number; right: number }; maxHeightM: number; chartWidth?: number }) {
		if (activeTrendPointerId === event.pointerId) setTrendAltitudeFromPointer(event, geometry);
	}

	function endTrendDrag(event: PointerEvent) {
		if (activeTrendPointerId !== event.pointerId) return;
		activeTrendPointerId = null;
		const slider = event.currentTarget as SVGRectElement;
		try { if (slider.hasPointerCapture(event.pointerId)) slider.releasePointerCapture(event.pointerId); } catch { /* 浏览器可能已自动释放指针捕获 */ }
	}

	function selectTrendPoint(heightM: number) {
		setTargetAltitudeFromMsl(heightM);
	}

	function routePositionFromPointer(event: PointerEvent, snapToLayer = false) {
		const target = event.currentTarget as SVGElement;
		const svg = target instanceof SVGSVGElement ? target : target.ownerSVGElement;
		const bounds = svg?.getBoundingClientRect();
		if (!bounds || bounds.height <= 0 || bounds.width <= 0) return null;
		const { plot, height, maxHeightM } = crossSectionGeometry;
		const chartY = (event.clientY - bounds.top) / bounds.height * height;
		const fraction = Math.min(1, Math.max(0, (plot.bottom - chartY) / (plot.bottom - plot.top)));
		const chartX = (event.clientX - bounds.left) / bounds.width * crossSectionGeometry.width;
		const mark = crossSectionGeometry.sampleMarks.find(mark => chartX >= mark.left && chartX <= mark.left + mark.width)
			?? (chartX < plot.left ? crossSectionGeometry.sampleMarks[0] : crossSectionGeometry.sampleMarks.at(-1));
		if (!mark) return null;
		const nearestLevel = snapToLayer ? crossSectionGeometry.levelMarks
			.filter(level => level.sampleIndex === mark.sampleIndex && Math.abs(level.y - chartY) <= 8 * height / bounds.height)
			.sort((a, b) => Math.abs(a.y - chartY) - Math.abs(b.y - chartY))[0] : null;
		return { sampleIndex: mark.sampleIndex, altitudeM: nearestLevel?.heightM ?? Math.round(fraction * maxHeightM / 50) * 50 };
	}

	function flushRoutePointer() {
		if (routePointerFrame !== null) cancelAnimationFrame(routePointerFrame);
		routePointerFrame = null;
		const next = pendingRoutePointer;
		pendingRoutePointer = null;
		if (!next) return;
		if (!routePointerReadout || routePointerReadout.sampleIndex !== next.sampleIndex || routePointerReadout.altitudeM !== next.altitudeM) {
			routePointerReadout = { sampleIndex: next.sampleIndex, altitudeM: next.altitudeM };
		}
		if (next.dragging && activeRouteAltitudePointerId !== null) {
			if (targetAltitudeM !== next.altitudeM) setTargetAltitudeFromMsl(next.altitudeM);
			if (routeFocusedIndex !== next.sampleIndex) routeFocusedIndex = next.sampleIndex;
		}
	}

	function queueRoutePointer(event: PointerEvent, dragging: boolean) {
		const position = routePositionFromPointer(event, !dragging);
		if (!position) return;
		pendingRoutePointer = { ...position, dragging };
		if (routePointerFrame === null) routePointerFrame = requestAnimationFrame(flushRoutePointer);
	}

	function hoverRouteChart(event: PointerEvent) {
		if (activeRouteAltitudePointerId === null) queueRoutePointer(event, false);
	}

	function clearRoutePointerReadout() {
		if (activeRouteAltitudePointerId !== null) return;
		if (routePointerFrame !== null) cancelAnimationFrame(routePointerFrame);
		routePointerFrame = null;
		pendingRoutePointer = null;
		routePointerReadout = null;
	}

	function resetRoutePointerInteraction() {
		activeRouteAltitudePointerId = null;
		clearRoutePointerReadout();
	}

	function selectRouteSample(index: number) {
		clearRoutePointerReadout();
		routeFocusedIndex = index;
	}

	function beginRouteAltitudeDrag(event: PointerEvent) {
		if (!event.isPrimary || event.button !== 0) return;
		event.preventDefault();
		const handle = event.currentTarget as SVGGElement;
		try { handle.setPointerCapture(event.pointerId); } catch { return; }
		activeRouteAltitudePointerId = event.pointerId;
		handle.focus({ preventScroll: true });
		queueRoutePointer(event, true);
	}

	function moveRouteAltitudeDrag(event: PointerEvent) {
		if (activeRouteAltitudePointerId === event.pointerId) queueRoutePointer(event, true);
	}

	function endRouteAltitudeDrag(event: PointerEvent) {
		if (activeRouteAltitudePointerId !== event.pointerId) return;
		flushRoutePointer();
		activeRouteAltitudePointerId = null;
		routePointerReadout = null;
		const handle = event.currentTarget as SVGGElement;
		try { if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId); } catch { /* Pointer capture may already have ended. */ }
	}
	function handleTrendPointKeydown(event: KeyboardEvent, heightM: number) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		selectTrendPoint(heightM);
	}

	function handleTrendSliderKeydown(event: KeyboardEvent, maxHeightM: number) {
		const next = altitudeAfterSliderKey(Number(targetAltitudeM), event.key, maxHeightM, 50);
		if (next === null) return;
		event.preventDefault();
		if (profileViewer === 'route') clearRoutePointerReadout();
		setTargetAltitudeFromMsl(next);
	}

	function methodLabel(method: string | undefined) {
		return method === 'direct' ? '模式层原值' : method === 'interpolated' ? '层间插值' : '缺测';
	}

	function cloudColor(value: number | null) {
		if (typeof value !== 'number' || !Number.isFinite(value)) return '#e3e8e7';
		if (value <= 0) return 'transparent';
		if (value <= 25) return '#67a981';
		if (value <= 50) return '#d7b84f';
		if (value <= 75) return '#df8a4f';
		return '#c85d58';
	}

	function crossSectionColor(value: number | null, variable: string) {
		if (typeof value !== 'number' || !Number.isFinite(value)) return '#e3e8e7';
		if (variable === 'cloud') return cloudColor(value);
		if (variable === 'humidity') return value < 40 ? '#edf2d8' : value < 60 ? '#bedbbd' : value < 75 ? '#80c3bd' : value < 90 ? '#4c9aab' : '#2c668e';
		if (variable === 'temperature') return value < -30 ? '#315f93' : value < -10 ? '#6eabc1' : value < 0 ? '#b8d8d0' : value < 10 ? '#ecd48a' : value < 20 ? '#e49a5e' : '#c75b52';
		return value < 5 ? '#dce9df' : value < 10 ? '#9ec7a7' : value < 20 ? '#e3c66a' : value < 30 ? '#e69755' : '#c95c4c';
	}

	function buildRouteLegendSteps(variable: string, unitSystem: 'metric' | 'imperial') {
		const ranges: Record<string, Array<[number, string]>> = {
			humidity: [[0, '0–不足40%'], [40, '40–不足60%'], [60, '60–不足75%'], [75, '75–不足90%'], [90, '90–100%']],
			temperature: [
				[-40, `低于 ${Math.round(temperatureToDisplay(-30, unitSystem) ?? -30)} ${temperatureUnit(unitSystem)}`],
				[-20, `${Math.round(temperatureToDisplay(-30, unitSystem) ?? -30)} 至不足 ${Math.round(temperatureToDisplay(-10, unitSystem) ?? -10)} ${temperatureUnit(unitSystem)}`],
				[-5, `${Math.round(temperatureToDisplay(-10, unitSystem) ?? -10)} 至不足 ${Math.round(temperatureToDisplay(0, unitSystem) ?? 0)} ${temperatureUnit(unitSystem)}`],
				[5, `${Math.round(temperatureToDisplay(0, unitSystem) ?? 0)} 至不足 ${Math.round(temperatureToDisplay(10, unitSystem) ?? 10)} ${temperatureUnit(unitSystem)}`],
				[15, `${Math.round(temperatureToDisplay(10, unitSystem) ?? 10)} 至不足 ${Math.round(temperatureToDisplay(20, unitSystem) ?? 20)} ${temperatureUnit(unitSystem)}`],
				[25, `${Math.round(temperatureToDisplay(20, unitSystem) ?? 20)} ${temperatureUnit(unitSystem)} 及以上`],
			],
			wind: [
				[0, `低于 ${Math.round(windToDisplay(5, unitSystem) ?? 5)} ${windUnit(unitSystem)}`],
				[5, `${Math.round(windToDisplay(5, unitSystem) ?? 5)} 至不足 ${Math.round(windToDisplay(10, unitSystem) ?? 10)} ${windUnit(unitSystem)}`],
				[10, `${Math.round(windToDisplay(10, unitSystem) ?? 10)} 至不足 ${Math.round(windToDisplay(20, unitSystem) ?? 20)} ${windUnit(unitSystem)}`],
				[20, `${Math.round(windToDisplay(20, unitSystem) ?? 20)} 至不足 ${Math.round(windToDisplay(30, unitSystem) ?? 30)} ${windUnit(unitSystem)}`],
				[30, `${Math.round(windToDisplay(30, unitSystem) ?? 30)} ${windUnit(unitSystem)} 及以上`],
			],
		};
		return (ranges[variable] ?? []).map(([value, label]) => ({ label, color: crossSectionColor(value, variable) }));
	}

	function cloudThicknessColor(value: number | null) {
		if (!Number.isFinite(value)) return '#6c7482';
		if (value < 500) return '#67a981';
		if (value < 1_500) return '#d7b84f';
		if (value < 3_000) return '#df8a4f';
		return '#c85d58';
	}

		function routeCellTitle(cell: { missing: boolean; value: number | null; pressureHPa: number | null; source?: string }, system: 'metric' | 'imperial' = unitSystem) {
			if (routeDisplayVariable === 'thickness') return '厚度图显示模式云带层界估算与相对湿度≥90%的可能云区；不是直接云厚度观测';
			return cell.missing ? '缺测，不代表无云' : `${routeMetricValue(cell.value, system)} · ${cell.source === 'model-surface' ? '模式地形近地面值' : `${cell.pressureHPa} 百帕`}${routeEstimatedCoverage ? ' · 附近路段按最近采样点估算' : ''}`;
	}

	function directCloudBandTitle(band: { lowHeightM: number; highHeightM: number; lowerBoundaryKnown: boolean; upperBoundaryKnown: boolean; thicknessM: number | null; peakCloudPct: number; levelCount: number }, system: 'metric' | 'imperial' = unitSystem) {
		const low = band.lowerBoundaryKnown ? formatHeight(band.lowHeightM, 0, system) : '低边界未确定';
		const high = band.upperBoundaryKnown ? formatHeight(band.highHeightM, 0, system) : '高边界未确定';
		const thickness = band.thicknessM === null ? '边界不完整，不能估算厚度'
			: `层界估算厚度约 ${formatHeight(band.thicknessM, 0, system)}`;
		const overflow = band.highHeightM > 9_000 ? `；${band.upperBoundaryKnown ? '估算云顶超过 9000 米图框' : '可能延伸到图框以上，云顶未确定'}` : '';
		return `Windy 逐层云量识别的模式云带：${low}至${high}；最高云量 ${Math.round(band.peakCloudPct)}%；${thickness}；边界按相邻模式层中点估算${overflow}`;
	}

	function routeCloudBandTitle(band: { lowHeightM: number; highHeightM: number; lowerBoundaryKnown: boolean; upperBoundaryKnown: boolean; thicknessM: number | null }, system: 'metric' | 'imperial' = unitSystem) {
		const low = band.lowerBoundaryKnown ? formatHeight(band.lowHeightM, 0, system) : '低边界未确定';
		const high = band.upperBoundaryKnown ? formatHeight(band.highHeightM, 0, system) : '高边界未确定';
		const thickness = band.thicknessM === null ? '边界不全，不能计算厚度'
			: `估算厚度约 ${formatHeight(band.thicknessM, 0, system)}，不等同云层实测厚度`;
		const overflow = band.extendsAboveChart ? `；${band.upperBoundaryKnown ? '估算云顶超过 9000 米图框' : '可能延伸到图框以上，云顶未确定'}` : '';
		return `相对湿度≥90%可能云区：${low}至${high}；${thickness}${overflow}`;
	}

	function handleRouteSampleKeydown(event: KeyboardEvent, index: number) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		selectRouteSample(index);
	}

	function routeMetricValue(value: number | null, system: 'metric' | 'imperial' = unitSystem) {
		return routeDisplayVariable === 'temperature' ? formatTemperature(value, 1, system)
			: routeDisplayVariable === 'wind' ? formatWind(value, 1, system)
			: formatValue(value, 0, '%');
	}

	function modelMatchesSelection(profile: WeatherProfile, requested: ForecastModel) {
		return profileMatchesRequestedModel(profile, requested);
	}

	function formatSourceTime(value: string | null | undefined) {
		if (!value) return '未提供';
		const timestamp = Date.parse(value);
		return Number.isFinite(timestamp) ? `${formatForecastTime(timestamp)} 北京时间` : value;
	}

	function nearestTimestamp(timestamps: number[], referenceTimestampMs = selectedForecastTimestampMs ?? windyTimestampMs ?? Date.now()) {
		return nearestForecastTimestamp(timestamps, referenceTimestampMs);
	}

	function changeForecastStep(step: 1 | 3) {
		if (forecastStep === step) return;
		if (effectiveForecastTimestampMs !== null) selectedForecastTimestampMs = effectiveForecastTimestampMs;
		forecastStep = step;
		if (selectionMode === 'point' && selectedPoint) {
			resetPointWeather();
			void loadPointProfile();
		} else if (selectionMode === 'route' && routePoints.length >= 2) {
			resetRouteWeather();
			void loadRouteProfile();
		}
	}

	function changeForecastTime(timestamp: number) {
		if (!Number.isFinite(timestamp)) return;
		selectedForecastTimestampMs = timestamp;
		store.set('timestamp', timestamp);
	}

	function handleForecastTimeChange(event: Event) {
		changeForecastTime(Number((event.currentTarget as HTMLSelectElement).value));
	}

	function moveForecastTime(delta: number) {
		const index = profileTimeIndex + delta;
		if (index >= 0 && index < profileTimeOptions.length) changeForecastTime(profileTimeOptions[index]);
	}

	function stepperText(direction: -1 | 1) {
		const nextIndex = profileTimeIndex + direction;
		const hasNeighbor = profileTimeIndex >= 0 && nextIndex >= 0 && nextIndex < profileTimeOptions.length;
		const hours = hasNeighbor
			? Math.round(Math.abs(profileTimeOptions[nextIndex] - profileTimeOptions[profileTimeIndex]) / 360_000) / 10
			: forecastStep;
		const value = Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1);
		return `${direction < 0 ? '−' : '＋'}${value} 小时`;
	}

	function resetPointWeather() {
		pointRequestController?.abort();
		pointRequestController = null;
		activePointProfileRun += 1;
		pointProfileLoading = false;
		pointElevationLoading = false;
		pointProfile = null;
		pointProfileError = '';
	}

	function resetRouteWeather() {
		routeWeatherRequestController?.abort();
		routeWeatherRequestController = null;
		activeRouteWeatherRun += 1;
		routeWeatherLoading = false;
		routeWeatherProgress = 0;
		routeWeatherSamples = [];
		routeWeatherTimesMs = [];
		routeWeatherError = '';
		routeDiagnosticSummaryCopyStatus = '';
		routeDiagnosticSummaryText = '';
		routeFocusedIndex = 0;
	}

	function selectModel(model: ForecastModel) {
		if (selectedModel === model) return;
		selectedModel = model;
		resetPointWeather();
		resetRouteWeather();
		if (selectionMode === 'point' && selectedPoint) void loadPointProfile();
		else if (selectionMode === 'route' && routePoints.length >= 2) void loadRouteProfile();
	}

	async function copyPointDiagnosticSummary() {
		if (!pointProfile && !pointProfileError) return;
		pointProfileSummaryCopyStatus = '';
		pointProfileSummaryText = '';
		const profileForSummary = pointProfile ?? {
			ok: false,
			error: 'Windy 请求未返回可解析的天气剖面',
			dataSource: 'windy-point-forecast-v3',
			requestedModel: selectedModel,
			servedModel: null,
			servedModelSource: 'unknown',
			frames: [],
			timestampsMs: [],
			responseArrays: {},
		};
		const timestampMs = effectiveForecastTimestampMs ?? selectedForecastTimestampMs ?? profileForSummary.timestampsMs?.[0] ?? null;
		const summary = buildProfileDiagnosticSummary(profileForSummary, timestampMs, pointTerrainM);
		if (await copyTextToClipboard(summary)) {
			pointProfileSummaryCopyStatus = '数据摘要已复制（不含天气数值）';
			return;
		}
		pointProfileSummaryText = summary;
		pointProfileSummaryCopyStatus = '无法自动复制；可点击下方文本框全选后复制（不含天气数值）';
		await tick();
		selectDiagnosticSummary();
	}

	function selectDiagnosticSummary() {
		pointProfileSummaryTextarea?.focus();
		pointProfileSummaryTextarea?.select();
	}

	function routeDiagnosticStatus(sample: RouteWeatherSample) {
		const profile = sample.profile ?? sample.diagnosticProfile;
		if (sample.profile?.ok) return `垂直层 ${sample.profile.frames?.reduce((maximum, frame) => Math.max(maximum, frame.levels?.length ?? 0), 0) ?? 0} 层 · 可用时次 ${sample.profile.timestampsMs?.length ?? 0} 个`;
		if (profile?.ok) return '仅有近地面天气值，没有可用垂直层';
		if (profile) return '已收到响应，但未解析到可用天气值';
		return sample.error ? '请求或响应解析失败，可复制摘要查看状态' : '尚无可诊断的天气响应';
	}

	function buildRouteDiagnosticSummary(sample: RouteWeatherSample) {
		const profileForSummary = sample.diagnosticProfile ?? sample.profile ?? {
			ok: false,
			error: sample.error || 'Windy 请求未返回可解析的天气剖面',
			dataSource: 'windy-point-forecast-v3',
			requestedModel: selectedModel,
			servedModel: null,
			servedModelSource: 'unknown',
			frames: [],
			timestampsMs: [],
			responseArrays: {},
		};
		const timestampMs = effectiveForecastTimestampMs ?? selectedForecastTimestampMs ?? profileForSummary.timestampsMs?.[0] ?? null;
		return `路线分析点：${sample.name} · 沿线 ${formatDistance(sample.distanceM, 1, unitSystem)}\n\n${buildProfileDiagnosticSummary(profileForSummary, timestampMs, sample.terrainElevationM)}`;
	}

	async function copyRouteDiagnosticSummary(sample: RouteWeatherSample) {
		routeDiagnosticSummaryCopyStatus = '';
		routeDiagnosticSummaryText = '';
		const summary = buildRouteDiagnosticSummary(sample);
		if (await copyTextToClipboard(summary)) {
			routeDiagnosticSummaryCopyStatus = `${sample.name} 的诊断摘要已复制（不含天气数值或坐标）`;
			return;
		}
		routeDiagnosticSummaryText = summary;
		routeDiagnosticSummaryCopyStatus = '无法自动复制；可点击下方文本框全选后复制（不含天气数值或坐标）';
		await tick();
		selectRouteDiagnosticSummary();
	}

	async function copyAllRouteDiagnosticSummaries() {
		routeDiagnosticSummaryCopyStatus = '';
		routeDiagnosticSummaryText = '';
		const summary = `Windy 路线天气数据诊断摘要（${routeWeatherSamples.length} 个分析点）\n\n${routeWeatherSamples.map(buildRouteDiagnosticSummary).join('\n\n' + '─'.repeat(36) + '\n\n')}`;
		if (await copyTextToClipboard(summary)) {
			routeDiagnosticSummaryCopyStatus = `已复制全部 ${routeWeatherSamples.length} 个分析点的摘要（不含天气数值或坐标）`;
			return;
		}
		routeDiagnosticSummaryText = summary;
		routeDiagnosticSummaryCopyStatus = '无法自动复制；可点击下方文本框全选后复制（不含天气数值或坐标）';
		await tick();
		selectRouteDiagnosticSummary();
	}

	function selectRouteDiagnosticSummary() {
		routeDiagnosticSummaryTextarea?.focus();
		routeDiagnosticSummaryTextarea?.select();
	}

	async function loadPointProfile() {
		if (!selectedPoint || pointProfileLoading) return;
		const runId = ++activePointProfileRun;
		const requestController = new AbortController();
		pointRequestController = requestController;
		const point = { ...selectedPoint };
		const model = selectedModel;
		const step = forecastStep;
		pointProfileLoading = true;
		pointProfileError = '';
		pointProfileSummaryCopyStatus = '';
		pointProfileSummaryText = '';
		pointProfile = null;
		const needsElevation = pointElevationM === null;
		pointElevationLoading = needsElevation;
		if (needsElevation) pointElevationError = '';
		const forecastTask = loadWeatherProfile(point, model, 'detail', step, requestController.signal)
			.then(parsed => {
				if (runId !== activePointProfileRun) return;
				if (!parsed.ok) {
					pointProfile = parsed;
					pointProfileError = [parsed.error, parsed.verticalDataNotice].filter(Boolean).join('；');
					return;
				}
				if (!parsed.servedModel || !modelMatchesSelection(parsed, model)) {
					pointProfile = { ...parsed, ok: false };
					pointProfileError = parsed.servedModel
						? `已选择 ${model.toUpperCase()}，但 Windy 实际返回 ${parsed.servedModel}；为避免混用，未显示这组数据。`
						: 'Windy 响应未说明实际模式；为避免混用，未显示这组数据。';
					return;
				}
				pointProfile = parsed;
				selectedForecastTimestampMs = nearestTimestamp(parsed.timestampsMs);
			})
			.catch(error => {
				if (runId === activePointProfileRun) pointProfileError = error instanceof Error ? error.message : String(error);
			})
			.finally(() => {
				if (runId === activePointProfileRun) pointProfileLoading = false;
			});

		const elevationTask = needsElevation
			? withWindyRequestLimit(signal => getElevation(point.lat, point.lon, { abortSignal: signal }), elevationRequestKey(point), requestController.signal)
				.then(payload => {
					if (runId !== activePointProfileRun) return;
					pointElevationM = payloadNumber(payload);
					pointElevationError = pointElevationM === null ? 'Windy 未返回地形高度' : '';
				})
				.catch(error => {
					if (runId === activePointProfileRun) pointElevationError = error instanceof Error ? error.message : String(error);
				})
				.finally(() => {
					if (runId === activePointProfileRun) pointElevationLoading = false;
				})
			: Promise.resolve();

		await Promise.all([forecastTask, elevationTask]);
		if (pointRequestController === requestController) pointRequestController = null;
	}

	function cancelPointProfile() {
		activePointProfileRun += 1;
		pointRequestController?.abort();
		pointRequestController = null;
		pointProfileLoading = false;
		pointElevationLoading = false;
	}

	function commonRouteTimes(samples: RouteWeatherSample[]) {
		const profiles = samples.map(sample => sample.profile).filter((profile): profile is WeatherProfile => Boolean(profile?.ok));
		if (!profiles.length) return [];
		return profiles[0].timestampsMs.filter(timestamp => profiles.every(profile => profile.timestampsMs.some(candidate => Math.abs(candidate - timestamp) <= 1_000)));
	}

	async function loadRouteProfile() {
		if (routePoints.length < 2 || routeWeatherLoading) return;
		const runId = ++activeRouteWeatherRun;
		const requestedPoints = analysisPoints.map((point, index) => ({
			...point,
			name: point.name ?? (index === 0 ? '起点' : index === analysisPoints.length - 1 ? '终点' : `分析点 ${index + 1}`),
		}));
		const model = selectedModel;
		const step = forecastStep;
		if (requestedPoints.length < 2) {
			routeWeatherError = '路线至少需要两个分析点';
			return;
		}
		const requestController = new AbortController();
		routeWeatherRequestController = requestController;
		routeWeatherLoading = true;
		routeWeatherError = '';
		routeWeatherProgress = 0;
		// Retain every planned location while requests finish or are cancelled.
		// Otherwise continuous coverage could spread a completed point over unread kilometres.
		routeWeatherSamples = requestedPoints.map(point => ({ ...point, key: `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`, terrainElevationM: null, profile: null, error: '尚未读取' }));
		routeWeatherTimesMs = [];
		routeDiagnosticSummaryCopyStatus = '';
		routeDiagnosticSummaryText = '';
		let routeRateLimited = false;
		await mapWithConcurrency(requestedPoints, 3, async point => {
			if (runId !== activeRouteWeatherRun || routeRateLimited) return null;
			const key = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
			let profile: WeatherProfile | null = null;
			let diagnosticProfile: WeatherProfile | null = null;
			let terrainElevationM: number | null = null;
			let error = '';
			try {
				const parsed = await loadWeatherProfile(point, model, 'multiload', step, requestController.signal);
				if (runId !== activeRouteWeatherRun) return null;
				diagnosticProfile = parsed;
				if (parsed.ok && parsed.servedModel && modelMatchesSelection(parsed, model)) profile = parsed;
				else if (parsed.ok) error = parsed.servedModel
					? `所选 ${model.toUpperCase()}，Windy 实际返回 ${parsed.servedModel}，此点未纳入路线剖面`
					: 'Windy 未返回实际模式，此点未纳入路线剖面';
				else error = [parsed.error, parsed.verticalDataNotice].filter(Boolean).join('；');
			} catch (requestError) {
				error = isWindyRateLimit(requestError) ? 'Windy 请求频率达到限制' : requestError instanceof Error ? requestError.message : String(requestError);
				if (isWindyRateLimit(requestError)) routeRateLimited = true;
			}
			if (runId !== activeRouteWeatherRun) return null;
			if (!routeRateLimited) {
				try {
					terrainElevationM = payloadNumber(await withWindyRequestLimit(signal => getElevation(point.lat, point.lon, { abortSignal: signal }), elevationRequestKey(point), requestController.signal));
				} catch {
					terrainElevationM = null;
				}
			}
			const latestWaypoint = routePoints.find(waypoint => `${waypoint.lat.toFixed(5)},${waypoint.lon.toFixed(5)}` === key);
			const sample: RouteWeatherSample = { key, ...point, name: latestWaypoint?.name ?? point.name, terrainElevationM, profile, diagnosticProfile, error: error || undefined };
			routeWeatherSamples = [...routeWeatherSamples.filter(item => item.key !== key), sample].sort((a, b) => a.distanceM - b.distanceM);
			routeWeatherTimesMs = commonRouteTimes(routeWeatherSamples);
			routeWeatherProgress += 1;
			return sample;
		}, () => runId !== activeRouteWeatherRun || routeRateLimited);
		if (runId !== activeRouteWeatherRun) return;
		if (routeWeatherRequestController === requestController) routeWeatherRequestController = null;
		routeWeatherTimesMs = commonRouteTimes(routeWeatherSamples);
		if (routeRateLimited) routeWeatherError = `Windy 请求达到频率限制，已停止后续采样。当前完成 ${routeWeatherProgress}/${requestedPoints.length} 个天气点；稍后可重新读取。`;
		else if (routeWeatherSamples.every(sample => !sample.profile?.ok)) routeWeatherError = 'Windy 未返回任何可用路线天气剖面';
		else if (!routeWeatherTimesMs.length) routeWeatherError = '路线各点没有共同的有效预报时刻，避免混用不同时间';
		else selectedForecastTimestampMs = nearestTimestamp(routeWeatherTimesMs);
		if (routeWeatherSamples.some(sample => !sample.profile?.ok) && !routeWeatherError) routeWeatherError = '部分路线点数据缺失；缺测位置已留空';
		routeWeatherLoading = false;
	}

	function cancelRouteProfile() {
		activeRouteWeatherRun += 1;
		routeWeatherRequestController?.abort();
		routeWeatherRequestController = null;
		routeWeatherLoading = false;
	}

	function payloadNumber(payload: unknown): number | null {
		if (typeof payload === 'number' && Number.isFinite(payload)) return payload;
		if (payload && typeof payload === 'object') {
			const record = payload as Record<string, unknown>;
			const candidate = Number(record.data ?? record.value ?? record.elevation);
			if (Number.isFinite(candidate)) return candidate;
		}
		return null;
	}

	function undoRoutePoint() {
		resetRouteWeather();
		cancelTerrain();
		routePoints = normalizeRoutePointNames(routePoints.slice(0, -1));
		terrainSamples = [];
		terrainError = '';
	}

	function clearRoute() {
		resetRouteWeather();
		cancelTerrain();
		routePoints = [];
		terrainSamples = [];
		terrainError = '';
	}

	async function loadRouteTerrain() {
		if (routePoints.length < 2 || terrainLoading) return;
		const runId = ++activeTerrainRun;
		const requestController = new AbortController();
		terrainRequestController = requestController;
		const samples = samplePolyline(routePoints, 250);
		terrainLoading = true;
		terrainError = '';
		terrainSamples = [];
		terrainProgress = 0;
		terrainTotal = samples.length;
		for (let start = 0; start < samples.length; start += 200) {
			if (runId !== activeTerrainRun) return;
			const batch = samples.slice(start, start + 200);
			const elevations = await mapWithConcurrency(batch, 3, async point => {
				if (runId !== activeTerrainRun) return null;
				const key = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
				try {
					let elevationM = elevationCache.get(key);
					if (elevationM === undefined) {
						elevationM = payloadNumber(await withWindyRequestLimit(signal => getElevation(point.lat, point.lon, { abortSignal: signal }), elevationRequestKey(point), requestController.signal));
						elevationCache.set(key, elevationM);
					}
					if (runId !== activeTerrainRun) return null;
					terrainProgress += 1;
					return { ...point, elevationM };
				} catch {
					if (runId === activeTerrainRun) terrainProgress += 1;
					return { ...point, elevationM: null };
				}
			}, () => runId !== activeTerrainRun);
			if (runId !== activeTerrainRun) return;
			terrainSamples = [...terrainSamples, ...elevations.filter(Boolean)];
		}
		if (runId !== activeTerrainRun) return;
		if (terrainRequestController === requestController) terrainRequestController = null;
		terrainLoading = false;
		if (terrainSamples.filter(point => Number.isFinite(point.elevationM)).length < 2) terrainError = '地形数据不足，无法绘制剖面';
	}

	function cancelTerrain() {
		activeTerrainRun += 1;
		terrainRequestController?.abort();
		terrainRequestController = null;
		terrainLoading = false;
	}

	function paramsFromUrl(params: unknown) {
		if (!params || typeof params !== 'object') return;
		const record = params as Record<string, unknown>;
		const lat = Number(record.lat);
		const lon = Number(record.lon);
		if (isValidCoordinate({ lat, lon })) {
			selectionMode = 'point';
			selectPoint({ id: 'url', name: 'Windy 地点', lat, lon }, 'Windy 地点坐标，按原值使用');
		}
	}

	export const onopen = (params: unknown) => paramsFromUrl(params);

	onMount(() => {
		const timestamp = Number(store.get('timestamp'));
		windyTimestampMs = Number.isFinite(timestamp) ? timestamp : null;
		const product = store.get('product');
		selectedModel = product === 'icon' ? 'icon' : 'ecmwf';
		forecastContextReady = true;
		if (selectedPoint) void loadPointProfile();
		timestampListenerId = store.on('timestamp', value => {
			const nextTimestamp = Number(value);
			if (!Number.isFinite(nextTimestamp)) return;
			windyTimestampMs = nextTimestamp;
			const times = selectionMode === 'point' ? pointProfile?.timestampsMs ?? [] : routeWeatherTimesMs;
			selectedForecastTimestampMs = times.length ? nearestTimestamp(times, nextTimestamp) : nextTimestamp;
		});
		productListenerId = store.on('product', value => selectModel(value === 'icon' ? 'icon' : 'ecmwf'));
		singleclick.on(config.name, handleMapClick);
		routeLayer = L.layerGroup().addTo(map);
		observationLayer = L.layerGroup().addTo(map);
		document.addEventListener('fullscreenchange', handleFullscreenChange);
	});

	$: if (routeLayer) drawMapItems(selectionMode, routePoints, selectedPoint);

		onDestroy(() => {
			resetRoutePointerInteraction();
			pointRequestController?.abort();
			routeWeatherRequestController?.abort();
			terrainRequestController?.abort();
			activeTerrainRun += 1;
		activePointProfileRun += 1;
		activeRouteWeatherRun += 1;
		if (timestampListenerId !== null) store.off(timestampListenerId);
		if (productListenerId !== null) store.off(productListenerId);
		singleclick.off(config.name, handleMapClick);
		if (routeLayer) {
			routeLayer.remove();
			routeLayer = null;
		}
		document.removeEventListener('fullscreenchange', handleFullscreenChange);
		if (document.fullscreenElement === profileViewerElement && typeof document.exitFullscreen === 'function') void document.exitFullscreen().catch(() => {});
		elevationCache.clear();
		weatherProfileCache.clear();
		observationLayer?.remove();
		if (observationMapFrame !== null) cancelAnimationFrame(observationMapFrame);
	});
</script>

<style>
	.plugin-shell {
		--profile-ink: #17282e;
		--profile-muted: #4e6265;
		--profile-line: #d7e1df;
		--profile-paper: #ffffff;
		--profile-water: #176b76;
		--profile-water-soft: #e2f1ef;
		--profile-warm: #cf7848;
		--profile-green: #4e805c;
		--profile-red: #b45148;
		background: var(--profile-paper);
		border-radius: 8px;
		color: var(--profile-ink);
		color-scheme: light;
		font-family: Inter, "Aptos", "Segoe UI", sans-serif;
		padding-bottom: 24px;
	}

	.plugin-shell :global(button) { font: inherit; }
	.plugin-shell > .plugin__content {
		background: #fff !important;
		color: var(--profile-ink) !important;
		color-scheme: light;
	}
	.plugin-shell > .plugin__mobile-header {
		background: #fff !important;
		color: var(--profile-ink) !important;
	}
	.plugin-shell .plugin__title { color: var(--profile-ink) !important; }
	.back-button { display: block; width: 100%; border: 0; padding: 0; background: transparent; cursor: pointer; text-align: left; }
	.plugin-shell :global(button:focus-visible),
	.plugin-shell :global(summary:focus-visible) { outline: 3px solid #168b99; outline-offset: 2px; }
	.plugin-shell :global(button:disabled) { cursor: wait; opacity: .62; }
	.eyebrow { margin: 0; color: var(--profile-water); font-size: 11px; font-weight: 800; letter-spacing: .1em; line-height: 1.35; }
	.intro-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin: 19px 0 16px; }
	.plugin-version { flex: 0 0 auto; border: 1px solid var(--profile-line); border-radius: 999px; padding: 3px 9px; color: var(--profile-muted); font-size: 14px; line-height: 1.4; }
	.model-row { display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items: end; gap: 12px; padding: 11px 0 16px; border-top: 1px solid var(--profile-line); border-bottom: 1px solid var(--profile-line); }
	.control-group { display: flex; min-width: 0; flex-direction: column; align-items: flex-start; gap: 6px; }
	.model-control-group { width: 100%; }
	.unit-control-group { justify-self: end; align-items: flex-end; }
	.control-label { color: var(--profile-muted); font-size: 14px; font-weight: 700; line-height: 1.25; white-space: nowrap; }
	.segmented { display: inline-flex; min-width: 0; align-items: center; gap: 3px; border: 1px solid var(--profile-line); border-radius: 9px; padding: 3px; background: #edf3f0; }
	.segmented button { flex: 0 0 auto; min-height: 34px; border: 0; border-radius: 6px; padding: 0 12px; background: transparent; color: #536466; cursor: pointer; font-size: 12px; font-weight: 700; line-height: 1.2; white-space: nowrap; }
	.model-control-group .segmented { display: flex; width: 100%; }
	.model-control-group .segmented button { flex: 1 1 0; min-width: 0; }
	.segmented button.active { background: #fff; color: var(--profile-water); box-shadow: 0 1px 3px #192e3219; }
	.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin: 20px 0 7px; }
	.section-heading h2 { margin: 3px 0 0; color: var(--profile-ink); font-size: 18px; font-weight: 750; letter-spacing: -.025em; }
	.section-copy { margin: 0 0 13px; color: var(--profile-muted); font-size: 15px; line-height: 1.55; text-wrap: pretty; }
	.primary-button, .secondary-button, .small-button { min-height: 42px; border: 0; border-radius: 8px; padding: 0 14px; cursor: pointer; font-size: 13px; font-weight: 750; transition: background-color .18s ease, transform .18s ease; }
	.primary-button { display: inline-flex; align-items: center; gap: 8px; background: var(--profile-water); color: white; }
	.primary-button:hover:not(:disabled) { background: #105861; transform: translateY(-1px); }
	.button-mark { display: inline-grid; width: 18px; height: 18px; place-items: center; border: 1px solid #ffffff76; border-radius: 50%; font-size: 15px; line-height: 1; }
	.text-button { min-height: 38px; border: 0; padding: 0 6px; background: transparent; color: var(--profile-water); cursor: pointer; font-size: 13px; font-weight: 700; }
	.danger-text { color: #9b5b4c; }
	.divider { height: 1px; margin: 21px 0 0; background: var(--profile-line); }
	.route-heading { align-items: center; }
	.segmented.compact button { min-height: 31px; padding: 0 10px; }
	.coordinate-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px 12px; border: 1px solid var(--profile-line); border-radius: 9px; padding: 12px; background: #f8faf8; }
	.coordinate-card > div:first-child { display: flex; flex-direction: column; gap: 4px; }
	.tiny-label { color: var(--profile-muted); font-size: 11px; }
	.coordinate-card strong { font-size: 16px; }
	.coord-value { grid-column: 2; grid-row: 1; color: #536565; font-family: "Fira Code", Consolas, monospace; font-size: 14px; text-align: right; }
	.coordinate-provenance { grid-column: 1 / -1; color: #4f6965; font-size: 15px; line-height: 1.5; }
	.point-facts { display: flex; grid-column: 1 / -1; flex-wrap: wrap; gap: 5px 12px; color: #365d59; font-size: 15px; }
	.point-empty-state { margin-top: 10px; border: 1px dashed #a9c6c0; border-radius: 9px; padding: 13px; background: #f5faf8; color: var(--profile-ink); }
	.point-empty-state strong { font-size: 17px; }
	.point-empty-state p { margin: 5px 0 0; color: var(--profile-muted); font-size: 15px; line-height: 1.55; }
	.coordinate-import { margin-bottom: 9px; }
	.coordinate-format-note { margin: 0 0 6px; color: var(--profile-muted); font-size: 15px; line-height: 1.55; text-wrap: pretty; }
	.coordinate-entry { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: end; gap: 8px; margin-bottom: 9px; }
	.ovi-coordinate-entry { grid-template-columns: minmax(0, 1fr) auto; margin-top: 8px; }
	.coordinate-entry label { display: flex; min-width: 0; flex-direction: column; gap: 5px; color: var(--profile-muted); font-size: 14px; }
	.coordinate-entry input { box-sizing: border-box; width: 100%; min-height: 44px; border: 1px solid var(--profile-line); border-radius: 7px; padding: 0 9px; background: #fff; color: var(--profile-ink); font: 14px "Fira Code", Consolas, monospace; }
	.coordinate-import .point-error { display: block; margin-top: 6px; }
	.small-button { min-height: 44px; border: 1px solid var(--profile-line); background: #fff; color: var(--profile-water); }
	.coordinate-entry .small-button { grid-column: auto; grid-row: auto; }
	.point-error { grid-column: 1 / -1; color: var(--profile-red); font-size: 10px; line-height: 1.4; }
	.muted-copy { margin: 0; color: var(--profile-muted); font-size: 11px; }
	.route-toolbar { display: flex; justify-content: space-between; align-items: center; color: var(--profile-muted); font-size: 11px; }
	.route-toolbar > div { display: flex; gap: 5px; }
	.waypoint-list { list-style: none; margin: 6px 0 10px; padding: 0; }
	.waypoint-list li { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 7px; min-height: 48px; border-bottom: 1px solid #e6ece9; font-size: 12px; }
	.waypoint-index { display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; background: #e1efeb; color: var(--profile-water); font-family: "Fira Code", Consolas, monospace; font-size: 10px; font-weight: 700; }
	.waypoint-name-input { box-sizing: border-box; width: 100%; min-width: 0; min-height: 44px; border: 1px solid #d9e5e1; border-radius: 6px; padding: 0 8px; background: #fff; color: var(--profile-ink); font: inherit; font-weight: 650; }
	.waypoint-name-input:focus-visible { outline: 2px solid var(--profile-water); outline-offset: 1px; }
	.waypoint-list small { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; color: var(--profile-muted); font-family: "Fira Code", Consolas, monospace; font-size: 9px; line-height: 1.35; white-space: nowrap; }
	.analysis-count { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 10px 0 6px; color: var(--profile-muted); font-size: 11px; }
	.analysis-count strong { color: var(--profile-water); font-family: "Fira Code", Consolas, monospace; }
	.sample-count-control { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
	.sample-count-control input { box-sizing: border-box; width: 58px; min-height: 32px; border: 1px solid var(--profile-line); border-radius: 6px; padding: 0 6px; background: #fff; color: var(--profile-ink); font: 11px "Fira Code", Consolas, monospace; }
	.sample-count-control select { box-sizing: border-box; min-height: 36px; max-width: 145px; border: 1px solid var(--profile-line); border-radius: 6px; padding: 0 8px; background: #fff; color: var(--profile-ink); font: inherit; }
	.chart-frame { overflow: hidden; border: 1px solid var(--profile-line); border-radius: 8px; background: linear-gradient(180deg, #f8fbf8, #eef5f2); }
	.chart-frame svg { display: block; width: 100%; height: 145px; }
	.chart-scale { display: flex; justify-content: space-between; border-top: 1px solid #dfe8e4; padding: 5px 9px; color: var(--profile-muted); font-family: "Fira Code", Consolas, monospace; font-size: 9px; }
	.chart-empty { display: flex; height: 145px; flex-direction: column; align-items: center; justify-content: center; gap: 13px; color: var(--profile-muted); font-size: 12px; text-align: center; }
	.chart-rule { width: 68%; height: 30px; border-top: 1px dashed #adc5c0; border-radius: 50% 50% 0 0; transform: translateY(14px); }
	.route-actions { display: flex; gap: 8px; margin-top: 8px; }
	.secondary-button { border: 1px solid #bfd4cf; background: #eaf3f0; color: var(--profile-water); }
	.secondary-button:hover:not(:disabled) { background: #dcece8; }
	.weather-section { margin-top: 18px; border: 1px solid var(--profile-line); border-radius: 10px; padding: 12px; background: #fbfcfb; }
	.weather-section-heading { display: flex; align-items: end; justify-content: space-between; gap: 10px; margin-bottom: 5px; }
	.load-status { color: var(--profile-water); font-size: 15px; }
	.weather-section-heading h3 { margin: 3px 0 0; color: var(--profile-ink); font-size: 16px; font-weight: 750; }
	.data-source-tag { flex: 0 0 auto; border: 1px solid #c9dcd7; border-radius: 999px; padding: 4px 8px; color: #315d5d; font-size: 10px; font-weight: 700; }
	.weather-actions { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
	.diagnostic-copy-fallback { display: grid; gap: 8px; margin-top: 9px; border: 1px solid var(--profile-line); border-radius: 8px; padding: 10px; background: #f5faf9; color: var(--profile-ink); font-size: 13px; }
	.diagnostic-copy-fallback textarea { width: 100%; min-height: 150px; resize: vertical; border: 1px solid #c5d4d1; border-radius: 6px; padding: 8px; background: #fff; color: #17282e; font: 12px/1.45 ui-monospace, Consolas, monospace; user-select: text; }
	.forecast-time-row { display: flex; align-items: end; justify-content: space-between; gap: 8px; margin: 10px 0; }
	.forecast-time-row label { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 5px; color: var(--profile-muted); font-size: 11px; font-weight: 650; }
	.forecast-time-row select { box-sizing: border-box; width: 100%; min-height: 40px; border: 1px solid var(--profile-line); border-radius: 7px; padding: 0 9px; background: white; color: var(--profile-ink); font: inherit; font-size: 12px; }
	.time-stepper { display: flex; gap: 5px; }
	.time-stepper button { min-width: 52px; min-height: 40px; border: 1px solid var(--profile-line); border-radius: 7px; background: white; color: var(--profile-water); cursor: pointer; font-size: 11px; font-weight: 700; }
	.time-stepper button:disabled { color: #82908d; cursor: default; }
	.profile-meta { display: flex; flex-wrap: wrap; gap: 5px 12px; margin: 8px 0; color: #41595b; font-size: 10px; }
	.profile-meta span { border-radius: 5px; padding: 3px 6px; background: #edf4f1; }
	.interpolated-card { margin: 9px 0; border: 1px solid #cdded8; border-radius: 8px; padding: 9px; background: #f2f8f5; }
	.interpolated-card > label { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #385657; font-size: 11px; font-weight: 700; }
	.interpolated-card > label span { display: flex; align-items: center; gap: 5px; white-space: nowrap; }
	.interpolated-card input { box-sizing: border-box; width: 88px; min-height: 36px; border: 1px solid #bfd4cf; border-radius: 6px; padding: 0 7px; background: white; color: var(--profile-ink); font: 12px "Fira Code", Consolas, monospace; }
	.height-range-details { margin-top: 10px; border-top: 1px solid var(--profile-line); padding-top: 7px; }
	.height-range-details summary { min-height: 44px; color: #315b5d; cursor: pointer; font-size: 15px; font-weight: 750; }
	.height-range-controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 6px 0 9px; }
	.height-range-controls label { display: flex; min-width: 0; flex-direction: column; gap: 4px; color: var(--profile-muted); font-size: 14px; }
	.height-range-controls input { box-sizing: border-box; width: 100%; min-height: 44px; border: 1px solid var(--profile-line); border-radius: 7px; padding: 0 8px; background: #fff; color: var(--profile-ink); font: 15px "Fira Code", Consolas, monospace; }
	.target-values { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-top: 9px; }
	.target-values > span { display: flex; min-width: 0; flex-direction: column; gap: 2px; color: #627573; font-size: 10px; }
	.target-values b { color: #17383d; font-size: 13px; font-weight: 750; overflow-wrap: anywhere; }
	.target-values small { color: #536967; font-size: 9px; }
	.inline-note { margin: 7px 0 0; color: #596e6d; font-size: 11px; line-height: 1.45; }
	.inline-error { margin: 7px 0; border-left: 3px solid #b45148; padding: 7px 9px; background: #fcf1ee; color: #743e39; font-size: 11px; line-height: 1.45; overflow-wrap: anywhere; }
	.chart-legend, .cross-section-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 12px; margin: 8px 0 5px; color: #425a5a; font-size: 10px; }
	.chart-legend small, .cross-section-legend small { flex: 1 1 100%; color: #586c6a; font-size: 9px; line-height: 1.45; }
	.route-color-key { display: flex; flex-wrap: wrap; gap: 5px 9px; margin: 5px 0 8px; color: #526765; font-size: 9px; }
	.route-color-key span { display: inline-flex; align-items: center; gap: 4px; }
	.route-color-key i { display: inline-block; width: 11px; height: 9px; border: 1px solid #8b9d99; border-radius: 2px; }
	.route-color-key .missing-key { background: repeating-linear-gradient(135deg, #e3e8e7 0 3px, #aab6b3 3px 4px); }
	.route-color-key .possible-cloud-key, .chart-legend .possible-cloud-key { background: repeating-linear-gradient(135deg, #e1edf0 0 3px, #34748b 3px 4px); }
	.route-point-detail .humidity-cloud-note { color: #286b86; font-weight: 700; }
	.legend-cloud, .legend-temperature { display: inline-block; width: 14px; height: 8px; margin-right: 4px; border-radius: 2px; vertical-align: middle; }
	.legend-cloud { background: #67a981; }
	.legend-temperature { height: 2px; background: #c45f49; }
	.profile-chart-frame, .cross-section-frame { overflow: hidden; border: 1px solid #dbe5e2; border-radius: 8px; background: linear-gradient(180deg, #fbfdfc, #f3f7f5); }
	.profile-chart-frame svg { display: block; width: 100%; height: 250px; }
	.chart-heading-label { fill: #3d5e60; font-size: 9px; font-weight: 700; }
	.axis-label { fill: #5a6b6c; font-size: 9px; }
	.profile-grid { stroke: #dbe5e2; stroke-width: 1; }
	.profile-grid--vertical { stroke-dasharray: 2 4; }
	.cloud-axis { stroke: #9aafaa; stroke-width: 1; }
	.temperature-line { fill: none; stroke: #bf5949; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
	.temperature-dot { fill: #fff; stroke: #a6473d; stroke-width: 2; }
	.table-wrap { max-width: 100%; margin-top: 8px; }
	.profile-table { width: 100%; border-collapse: collapse; table-layout: fixed; color: #243b3d; font-size: 10px; }
	.profile-table th { padding: 6px 3px; border-bottom: 1px solid #cfdcd8; color: #48605f; text-align: left; font-size: 9px; font-weight: 750; }
	.profile-table td { padding: 6px 3px; border-bottom: 1px solid #e3eae7; vertical-align: top; overflow-wrap: anywhere; }
	.profile-table td:first-child { font-family: "Fira Code", Consolas, monospace; font-size: 10px; }
	.profile-table td small { display: block; margin-top: 2px; color: #5a6c6b; font-family: inherit; font-size: 9px; }
	.route-weather-section { margin-top: 13px; }
	.route-diagnostic-details { margin-top: 10px; border: 1px solid var(--profile-line); border-radius: 8px; padding: 9px 11px; background: #f7faf8; color: var(--profile-ink); }
	.route-diagnostic-details summary { min-height: 44px; color: #315b5d; cursor: pointer; font-size: 15px; font-weight: 750; }
	.route-diagnostic-details > p { margin: 4px 0 8px; color: var(--profile-muted); font-size: 13px; line-height: 1.5; }
	.route-diagnostic-details ol { margin: 0; padding-left: 24px; }
	.route-diagnostic-details li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; border-top: 1px solid #dce7e3; padding: 9px 0; }
	.route-diagnostic-details li > div { display: grid; min-width: 0; gap: 3px; }
	.route-diagnostic-details li strong { color: #23464b; font-size: 14px; }
	.route-diagnostic-details li span { color: var(--profile-muted); font-size: 13px; line-height: 1.45; }
	.route-diagnostic-details li button { min-height: 42px; }
	.route-weather-controls { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 7px; color: #506563; font-size: 10px; }
	.metric-tabs { display: flex; gap: 3px; border: 1px solid #d5e1dd; border-radius: 7px; padding: 3px; background: #eff4f1; }
	.metric-tabs button { min-height: 34px; border: 0; border-radius: 5px; padding: 0 8px; background: transparent; color: #4f6665; cursor: pointer; font-size: 10px; }
	.metric-tabs button.active { background: white; color: #145e67; box-shadow: 0 1px 2px #153c3a26; font-weight: 750; }
	.cross-section-frame svg { display: block; width: 100%; height: 230px; }
	.route-terrain-line { fill: none; stroke: #173d44; stroke-width: 2.2; vector-effect: non-scaling-stroke; }
	.sample-column-line { stroke: #526b68; stroke-width: 1; stroke-dasharray: 2 4; opacity: .6; }
	.target-height-line { stroke: #ad6346; stroke-width: 1.5; stroke-dasharray: 5 4; }
	.route-sample-buttons { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
	.route-sample-buttons button { display: flex; min-width: 74px; min-height: 44px; flex: 1 1 74px; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px; border: 1px solid #d1dfdb; border-radius: 7px; padding: 4px 7px; background: #fff; color: #405a59; cursor: pointer; text-align: left; }
	.route-sample-buttons button.active { border-color: #3d8c8f; background: #eaf4f1; color: #194e53; }
	.route-sample-buttons button strong { font-size: 10px; }
	.route-sample-buttons button span { color: #5b6f6e; font-family: "Fira Code", Consolas, monospace; font-size: 9px; }
	.route-point-detail { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; border-top: 1px solid var(--profile-line); padding-top: 8px; }
	.route-point-detail > strong { color: #314f50; font-size: 11px; overflow-wrap: anywhere; }
	.route-point-detail > span { color: #5a6c6b; font-size: 10px; }
	.point-summary-card, .route-summary-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 12px; margin-top: 8px; border: 1px solid var(--profile-line); border-radius: 9px; padding: 12px; background: #f7faf8; }
	.point-summary-copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
	.point-summary-copy strong { color: #23464b; font-size: 15px; }
	.point-summary-copy span { color: var(--profile-muted); font-size: 14px; line-height: 1.45; }
	.viewer-open-button { grid-column: 2; grid-row: 1 / span 2; white-space: nowrap; }
	.route-summary-card > div { display: flex; flex-direction: column; gap: 3px; }
	.route-summary-card > div span { color: var(--profile-muted); font-size: 13px; }
	.route-summary-card > div strong { color: #23464b; font-size: 16px; }
	.route-weather-summary { grid-template-columns: repeat(2, minmax(0, 1fr)) auto; }
	.route-weather-summary .viewer-open-button { grid-column: 3; grid-row: 1; }
	.profile-viewer { position: fixed; z-index: 2147483000; inset: 0; width: 100vw; height: 100vh; height: 100dvh; overflow-y: auto; overscroll-behavior: contain; background: #0d1020; color: #eef2fa; color-scheme: dark; font-family: Inter, "Aptos", "Segoe UI", sans-serif; font-size: 16px; line-height: 1.5; }
	.profile-viewer:fullscreen { width: 100vw; height: 100vh; height: 100dvh; }
	.viewer-page { box-sizing: border-box; width: min(100%, 1840px); min-height: 100%; margin: 0 auto; padding: 28px 32px 40px; }
	.viewer-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
	.viewer-header h1 { margin: 4px 0 2px; color: #f5f7fc; font-size: clamp(28px, 3vw, 42px); line-height: 1.2; }
	.viewer-header p { margin: 0; color: #94a7c4; font-size: 16px; }
	.viewer-kicker { margin: 0; color: #aabbd2; font-family: "Fira Code", Consolas, monospace; font-size: 14px; letter-spacing: .08em; }
	.viewer-close { display: grid; flex: 0 0 52px; width: 52px; height: 52px; place-items: center; border: 1px solid #34405a; border-radius: 2px; background: #121629; color: #eff3fb; cursor: pointer; font-size: 34px; line-height: 1; }
	.viewer-close:hover { background: #202942; }
	.viewer-timebar { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 18px 0 20px; border: 1px solid #29324b; padding: 13px 16px; background: #0a0d1b; }
	.viewer-timebar > div:first-child { display: flex; flex-direction: column; gap: 2px; }
	.viewer-timebar > div:first-child span { color: #b3c0d4; font-family: "Fira Code", Consolas, monospace; font-size: 14px; }
	.viewer-timebar > div:first-child strong { color: #f1f4fa; font-size: 17px; }
	.viewer-time-controls { display: flex; align-items: center; gap: 8px; }
	.viewer-time-controls select { min-height: 42px; border: 1px solid #313b54; border-radius: 2px; padding: 0 10px; background: #111629; color: #e9eef9; font: inherit; }
	.profile-viewer .time-stepper button { min-height: 42px; border-color: #313b54; border-radius: 2px; background: #111629; color: #a9b9d2; font-size: 14px; }
	.viewer-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 20px 0 28px; }
	.viewer-stat-grid > div { display: flex; min-width: 0; min-height: 70px; flex-direction: column; justify-content: center; gap: 2px; border: 1px solid #29324b; padding: 10px 14px; background: #0a0d1b; }
	.viewer-stat-grid span { color: #b3c0d4; font-size: 14px; }
	.viewer-stat-grid strong { color: #f0f3fa; font-size: 20px; overflow-wrap: anywhere; }
	.viewer-provenance { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: -10px 0 16px; color: #b1bfd3; font-size: 14px; }
	.viewer-provenance span { border: 1px solid #29324b; padding: 4px 8px; background: #0a0d1b; }
	.multiple-altitude-details { margin: 12px 0 18px; border: 1px solid #34405a; padding: 10px 14px; background: #0a0d1b; }
	.multiple-altitude-details summary { min-height: 30px; color: #e4ebf6; cursor: pointer; font-size: 16px; font-weight: 700; }
	.multiple-altitude-details > p { margin: 6px 0 12px; color: #b3c1d5; font-size: 14px; line-height: 1.55; }
	.multi-altitude-input-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 10px; margin: 8px 0 12px; }
	.multi-altitude-input-row label { display: flex; min-width: 0; flex-direction: column; gap: 5px; color: #cbd6e7; font-size: 14px; font-weight: 650; }
	.multi-altitude-input-row input { box-sizing: border-box; width: 100%; min-height: 46px; border: 1px solid #34405a; border-radius: 3px; padding: 0 10px; background: #111629; color: #eff3fb; font: 16px "Fira Code", Consolas, monospace; }
	.multi-altitude-input-row .secondary-button { min-height: 46px; }
	.multi-altitude-table { min-width: 720px; }
	.viewer-section-head { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin: 18px 0 12px; }
	.viewer-section-head h2 { margin: 3px 0 0; color: #f0f3fa; font-size: 24px; }
	.viewer-section-head > span { color: #8d9eb9; font-size: 14px; }
	.viewer-target-control { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin: 0 0 14px; border: 1px solid #29324b; padding: 10px 14px; background: #101426; }
	.viewer-target-control label { display: inline-flex; align-items: center; gap: 8px; color: #c4cee0; font-weight: 700; }
	.viewer-target-control input { box-sizing: border-box; width: 110px; min-height: 40px; border: 1px solid #34405a; border-radius: 2px; padding: 0 9px; background: #090d1a; color: #f2f5fb; font: 16px "Fira Code", Consolas, monospace; }
	.viewer-target-control > span { color: #91a2bd; font-size: 14px; }
	.terrain-override-control { display: grid; grid-template-columns: minmax(210px, auto) 1fr; align-items: center; gap: 8px 14px; margin: -5px 0 14px; border: 1px solid #29324b; padding: 11px 14px; background: #101426; }
	.terrain-override-control label { display: flex; align-items: center; gap: 9px; color: #c4cee0; font-weight: 700; }
	.terrain-override-control input { box-sizing: border-box; width: 130px; min-height: 40px; border: 1px solid #34405a; border-radius: 2px; padding: 0 9px; background: #090d1a; color: #f2f5fb; font: 16px "Fira Code", Consolas, monospace; }
	.terrain-override-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 12px; }
	.terrain-override-control > p { grid-column: 1 / -1; margin: 0; color: #91a2bd; font-size: 14px; line-height: 1.5; }
	.terrain-override-control > p.inline-error { color: #ef9b91; }
	.altitude-presets { display: flex; flex-wrap: wrap; gap: 7px; margin: -5px 0 13px; }
	.altitude-presets button { min-height: 42px; border: 1px solid #35415b; border-radius: 2px; padding: 0 13px; background: #111629; color: #bdc9db; cursor: pointer; font: inherit; font-size: 14px; }
	.altitude-presets button.active { border-color: #5abf73; background: #1b3829; color: #d8f1dd; }
	.trend-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
	.trend-panel { min-width: 0; overflow: hidden; border: 1px solid #29324b; background: #090d1b; }
	.trend-panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px 0; }
	.trend-panel-heading h3 { margin: 0; color: #e9eef8; font-size: 18px; }
	.trend-panel-heading h3 small { color: #95a7c1; font-size: 14px; font-weight: 500; }
	.trend-panel-heading > span { max-width: 68%; color: #bdc9db; font-size: 16px; line-height: 1.45; text-align: right; white-space: normal; }
	.trend-panel svg { display: block; width: 100%; height: clamp(280px, 31vh, 420px); overflow: visible; }
	.profile-coverage-notice { margin: 0 0 13px; border: 1px solid #82683a; border-left: 4px solid #f0bd55; padding: 11px 14px; background: #27251e; color: #f5e3b3; }
	.profile-coverage-notice strong { display: block; margin-bottom: 3px; font-size: 15px; }
	.profile-coverage-notice p { margin: 0; color: #d7cba9; font-size: 14px; line-height: 1.55; }
	.profile-data-notice { margin: 0 0 13px; border: 1px solid #416357; border-left: 4px solid #66a88d; padding: 11px 14px; background: #202927; color: #e0eee7; }
	.profile-data-notice strong { display: block; margin-bottom: 3px; font-size: 15px; }
	.profile-data-notice p { margin: 0; color: #c1d2c8; font-size: 14px; line-height: 1.55; }
	.trend-interaction-hint { margin: 0 0 10px; color: #aebdd3; font-size: 14px; }
	.trend-data-note { margin: 0; border-top: 1px solid #29324b; padding: 10px 12px; background: #192235; color: #f0f4fa; font-size: 16px; line-height: 1.55; }
	.trend-data-note--top { margin: 0 10px 8px; border-top: 0; border-bottom: 1px solid #29324b; }
	.trend-observed-points { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 10px 10px; }
	.trend-observed-point { display: grid; min-width: 150px; grid-template-columns: 1fr auto; align-items: baseline; gap: 4px 14px; border: 1px solid #65738a; border-left: 4px solid var(--trend-color, #83b7f3); border-radius: 4px; padding: 9px 12px; background: #11182b; color: #f3f6fc; }
	.trend-observed-point strong { color: #e1e9f4; font-size: 16px; font-weight: 700; }
	.trend-observed-point b { color: #fff; font-size: 22px; font-variant-numeric: tabular-nums; }
	.trend-observed-point small { grid-column: 1 / -1; color: #d0d9e7; font-size: 15px; }
	.route-profile-coverage { margin: 0 0 12px; }
.route-nearest-level-summary { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; margin-top: 10px; border: 1px solid #416357; padding: 10px 12px; background: #192821; }
.route-nearest-level-summary > div { display: grid; gap: 3px; }
.route-nearest-level-summary strong { color: #e8f2e9; font-size: 16px; }
.route-nearest-level-summary span { color: #cbd9d1; font-size: 15px; }
.route-nearest-level-summary button { min-height: 44px; }
	.trend-point-value { fill: var(--trend-color); stroke: #090d1b; stroke-width: 3px; paint-order: stroke; font-family: "Fira Code", Consolas, monospace; font-size: 15px; font-weight: 700; }
	.trend-altitude-slider { fill: transparent; pointer-events: all; cursor: ew-resize; touch-action: none; }
	.trend-point-hit { fill: transparent; pointer-events: all; cursor: pointer; }
	.trend-point-hit:focus-visible { fill: #fff; fill-opacity: .18; stroke: #fff; stroke-width: 2; vector-effect: non-scaling-stroke; outline: none; }
	.trend-altitude-slider:focus-visible { fill: #63cf68; fill-opacity: .035; stroke: #63cf68; stroke-width: 1; stroke-dasharray: 4 4; vector-effect: non-scaling-stroke; outline: none; }
	.viewer-grid-line { stroke: #28324a; stroke-width: 1; stroke-dasharray: 3 6; }
	.viewer-grid-vertical { stroke-dasharray: 2 7; }
	.viewer-axis-label { fill: #c6d2e4; font-family: "Fira Code", Consolas, monospace; font-size: 15px; }
	.viewer-axis-title { fill: #aebdd2; font-size: 15px; font-weight: 700; }
	.viewer-below-terrain-area { fill: #d18b45; fill-opacity: .2; pointer-events: none; }
	.viewer-below-terrain-label { fill: #ffe0b5; font-size: 14px; font-weight: 700; pointer-events: none; }
	.viewer-terrain-line { stroke: #e3a65f; stroke-width: 1.5; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; }
	.viewer-terrain-label { fill: #ffe0b5; font-size: 14px; font-weight: 700; }
	.viewer-target-line { stroke: #63cf68; stroke-width: 2.5; stroke-dasharray: 7 5; }
	.viewer-route-target-path { fill: none; vector-effect: non-scaling-stroke; }
	.viewer-route-target-point { fill: #63cf68; stroke: #0a0d1b; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.condition-cue { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 12px; margin: 12px 0; border-left: 3px solid #e7a642; padding: 10px 13px; background: #27251e; color: #f2dfb2; }
	.condition-cue strong { flex: 0 0 100%; }
	.condition-cue p { flex: 0 0 100%; margin: 0; color: #d7cba9; font-size: 14px; line-height: 1.5; }
	.condition-cue span { border: 1px solid #625539; padding: 4px 7px; color: #f3e8cc; font-size: 14px; }
	.viewer-target-tag { fill: #244a31; stroke: #58bc63; stroke-width: 1; }
	.viewer-target-label { fill: #effff0; font-size: 14px; font-weight: 600; }
	.viewer-target-value-line { stroke: #63cf68; stroke-width: 1; stroke-dasharray: 3 5; opacity: .55; }
	.viewer-query-dot { fill: #f2fff1; stroke: var(--trend-color); stroke-width: 3; vector-effect: non-scaling-stroke; }
	.viewer-query-value-tag { fill: #244a31; stroke: #58bc63; stroke-width: 1; }
	.viewer-query-value-label { fill: #efffec; font-size: 14px; font-weight: 700; }
	.trend-line { fill: none; stroke: var(--trend-color); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
	.trend-line--reference { stroke: #94a0b3; stroke-width: 2.5; stroke-dasharray: 5 5; opacity: .8; }
	.trend-dot { fill: var(--trend-color); stroke: #141a2b; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.trend-reference-dot { fill: #8c96a8; stroke: #292f3d; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.viewer-empty-chart { display: grid; min-height: 280px; place-items: center; margin: 0; color: #97a8c1; }
	.query-data-status { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 16px; margin: 0 0 12px; border: 1px solid #775c39; border-left: 4px solid #e3a65f; padding: 10px 13px; background: #211e1a; color: #f5e7d1; }
	.query-data-status strong { font-size: 15px; }
	.query-data-status span { flex: 1 1 100%; color: #dac9ac; font-size: 14px; line-height: 1.5; }
	.query-data-status .secondary-button { min-height: 42px; }
	.viewer-cloud-section, .viewer-table-section { margin-top: 26px; border: 1px solid #29324b; padding: 8px 16px 16px; background: #0a0d1b; }
	.cloud-level-list { display: grid; gap: 8px; padding: 5px 0 10px; }
	.cloud-level-list > div { display: grid; grid-template-columns: minmax(120px, .8fr) minmax(100px, 2fr) 62px; align-items: center; gap: 14px; border-left: 3px solid #8f79e5; padding: 8px 12px; background: #15142d; }
	.cloud-level-list > div > span { display: flex; flex-direction: column; color: #dce4f2; font-weight: 700; }
	.cloud-level-list small { color: #b7c4d7; font-size: 14px; font-weight: 400; }
	.cloud-level-track { height: 12px; overflow: hidden; border-radius: 2px; background: #272c42; }
	.cloud-level-track i { display: block; height: 100%; background: #a18bf2; }
	.cloud-level-list strong { color: #c9bcff; text-align: right; }
	.cloud-direct-base { margin: 9px 0; color: #c4d0e2; font-size: 15px; }
	.possible-cloud-list { display: grid; gap: 8px; margin-top: 12px; border-top: 1px solid #29324b; padding-top: 12px; }
	.possible-cloud-list > strong { color: #bfd4e6; }
	.possible-cloud-list > div { display: flex; justify-content: space-between; gap: 12px; border-left: 3px solid #65b8ed; padding: 9px 12px; background: #101b2d; }
	.direct-cloud-list > div { border-left-color: #a18bf2; background: #17162a; }
	.possible-cloud-list > div > span { color: #dce6f4; font-weight: 700; }
	.possible-cloud-list small, .viewer-empty-note, .viewer-footnote { color: #b7c4d7; font-size: 15px; }
	.viewer-empty-note { margin: 8px 0; }
	.viewer-table-wrap { max-width: 100%; overflow-x: auto; }
	.viewer-table { width: 100%; min-width: 620px; border-collapse: collapse; color: #dce4f2; font-size: 14px; }
	.viewer-table th { padding: 10px 8px; border-bottom: 1px solid #33405a; color: #b9c8dd; text-align: left; font-size: 15px; font-weight: 650; }
	.viewer-table td { padding: 10px 8px; border-bottom: 1px solid #202a40; vertical-align: top; }
	.viewer-table td:first-child { font-family: "Fira Code", Consolas, monospace; }
	.viewer-table td small { display: block; margin-top: 3px; color: #b4c1d5; font-family: inherit; font-size: 14px; }
	.viewer-table tr.viewer-underground-row { background: #171a22; color: #aab1be; }
	.viewer-table tr.viewer-underground-row td:first-child small { color: #d6a46b; }
	.profile-viewer .height-range-details { margin-top: 15px; border-top-color: #29324b; }
	.profile-viewer .height-range-details summary { color: #cbd7e9; }
	.profile-viewer .height-range-controls label { color: #97a8c1; }
	.profile-viewer .height-range-controls input { border-color: #34405a; background: #0c1020; color: #edf2fa; }
	.viewer-footnote { margin: 14px 0 0; line-height: 1.55; }
	.viewer-loading { display: grid; min-height: 40vh; place-items: center; color: #a3b3ca; font-size: 20px; text-align: center; }
	.route-viewer-controls { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin: 12px 0; color: #9badc6; }
	.profile-viewer .metric-tabs { border-color: #313b54; background: #111629; }
	.profile-viewer .metric-tabs button { color: #a8b7ce; font-size: 15px; }
	.profile-viewer .metric-tabs button.active { background: #29334a; color: #eef3fa; box-shadow: none; }
	.profile-viewer .metric-tabs button:focus-visible,
	.profile-viewer button:focus-visible,
	.profile-viewer input:focus-visible,
	.profile-viewer select:focus-visible,
	.profile-viewer summary:focus-visible { outline: 3px solid #83c8ff; outline-offset: 2px; }
	.target-result-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 12px 0; }
	.target-result-grid > div { display: flex; min-width: 0; min-height: 78px; flex-direction: column; justify-content: center; gap: 3px; border: 1px solid #29324b; padding: 10px 12px; background: #0a0d1b; }
	.target-result-grid span { color: #91a2bd; font-size: 14px; }
	.target-result-grid strong { color: #f0f3fa; font-size: 22px; overflow-wrap: anywhere; }
	.target-result-grid small { color: #b8c5d8; font-size: 14px; }
	.cloud-assessment-wrap { margin: 12px 0; border-left: 4px solid #79a9bf; padding: 7px 12px; background: #131a2b; }
	.freezing-level-note { margin: 8px 0 12px; border-left: 3px solid #91b7d4; padding: 7px 11px; background: #111a2b; color: #d6e3f1; font-size: 15px; line-height: 1.5; }
	.cloud-assessment { margin: 0; color: #dce8f1; font-size: 16px; font-weight: 650; }
	.cloud-assessment--possible { color: #f2d47b; }
	.cloud-assessment--outside { color: #a6d3b9; }
	.cloud-assessment--uncertain, .cloud-assessment--insufficient { color: #e5b0a1; }
	.cloud-direct-target { margin: 4px 0 0; color: #a8b8d0; font-size: 14px; }
	.cloud-layer-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-top: 8px; color: #dce8f1; font-size: 14px; }
	.cloud-layer-summary strong { margin-right: 4px; color: #f2f5fb; }
	.route-surface-gust-note { display: flex; flex-wrap: wrap; align-items: baseline; gap: 5px 12px; margin: 8px 0 14px; border-left: 3px solid #dfb74d; padding: 8px 12px; background: #211f18; color: #f2e4bc; }
	.route-surface-gust-note strong { color: #f5eccf; }
	.route-surface-gust-note small { flex-basis: 100%; color: #ded1aa; font-size: 14px; }
	.route-target-results { margin-top: 4px; }
	.route-point-profile-block { width: 100%; margin: 12px 0 4px; border-top: 1px solid #29324b; padding-top: 12px; }
	.route-point-profile-block .viewer-section-head { margin-bottom: 10px; }
	.route-point-trend-grid { margin-top: 8px; }
	.viewer-chart-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 9px; margin: 10px 2px; color: #d1dbeb; font-size: 14px; line-height: 1.5; }
	.viewer-chart-legend strong { color: #f2f5fb; font-weight: 700; }
	.viewer-chart-legend span { display: inline-flex; align-items: center; gap: 7px; border: 1px solid #29324b; border-radius: 3px; padding: 4px 8px; background: #101626; }
	.viewer-chart-legend i { display: inline-block; flex: 0 0 18px; width: 18px; height: 14px; border: 1px solid #b3c0d2; }
	.viewer-chart-legend .legend-hatch { background: repeating-linear-gradient(135deg, #152331 0 4px, #72b8d0 4px 6px); }
	.viewer-chart-legend .legend-missing { background: repeating-linear-gradient(135deg, #626b7b 0 4px, #929aa7 4px 6px); }
	.viewer-chart-legend .legend-clear { background: transparent; border-style: dashed; }
	.route-chart-note { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 18px; margin: 9px 2px 2px; color: #b8c5d8; font-size: 14px; }
	.route-chart-note span { display: inline-flex; align-items: center; gap: 7px; }.route-chart-note .freezing-level-key { display: inline-block; width: 10px; height: 10px; border: 2px solid #ef936e; border-radius: 50%; background: #f5f7fc; }.viewer-freezing-mark { fill: #f5f7fc; stroke: #ef936e; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.route-comparison-section { margin-top: 22px; border-top: 1px solid #29324b; padding-top: 5px; }
	.route-comparison-intro { margin: -3px 0 12px; color: #aebbd0; font-size: 14px; line-height: 1.55; }
	.route-comparison-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
	.route-comparison-card { min-width: 0; border: 1px solid #34405a; padding: 12px; background: #0a0d1b; }
	.route-comparison-card--active { border-color: #7ec5e7; box-shadow: inset 0 0 0 1px #7ec5e7; }
	.route-comparison-select { display: grid; width: 100%; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; gap: 4px 10px; border: 0; border-bottom: 1px solid #29324b; padding: 2px 0 9px; background: transparent; color: #eff3fa; cursor: pointer; text-align: left; }
	.route-comparison-select > span { font-size: 17px; font-weight: 750; }
	.route-comparison-select > small { grid-column: 1; color: #9eacc3; font-size: 14px; }
	.route-comparison-select > strong { grid-column: 2; grid-row: 1 / span 2; color: #b7c8dc; font-size: 14px; }
	.route-comparison-select:disabled { opacity: .85; cursor: default; }
	.route-comparison-values { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; margin-top: 9px; }
	.route-comparison-values > div { min-width: 0; border: 1px solid #222c43; padding: 7px; background: #101629; }
	.route-comparison-values span, .route-comparison-values small { display: block; color: #9facc1; font-size: 14px; }
	.route-comparison-values strong { display: block; margin: 4px 0 2px; color: #eff3fa; font-size: 15px; overflow-wrap: anywhere; }
	.route-comparison-card > p.cloud-assessment { margin: 9px 0 0; border-left: 3px solid currentColor; padding: 6px 9px; background: #131a2b; font-size: 14px; line-height: 1.5; }
	.wind-arrow-key { position: relative; display: inline-block; width: 24px; height: 2px; background: #f5d16a; }
	.wind-arrow-key::after { position: absolute; top: -4px; right: -1px; width: 0; height: 0; border-top: 5px solid transparent; border-bottom: 5px solid transparent; border-left: 7px solid #f5d16a; content: ''; }
	.precipitation-key-total, .precipitation-total-bar { fill: #65b8ed; }
	.precipitation-key-snow, .precipitation-snow-bar { fill: #f2c85f; }
	.precipitation-key-total, .precipitation-key-snow { width: 16px !important; height: 10px !important; }
	.precipitation-section { margin-top: 16px; border: 1px solid #29324b; padding: 12px 14px; background: #0a0d1b; }
	.precipitation-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; color: #eff3fa; }
	.precipitation-heading strong { font-size: 18px; }
	.precipitation-heading span { color: #a6b5ca; font-size: 14px; }
	.precipitation-chart { overflow: hidden; margin-top: 8px; background: #090d1b; }
	.precipitation-chart svg { display: block; width: 100%; height: 148px; }
	.viewer-axis-line { stroke: #66758d; stroke-width: 1.2; }
	.precipitation-sample-dot { fill: #e8eef7; stroke: #11192a; stroke-width: 1.5; }
	.route-terrain-note { margin: 7px 0 14px; color: #b6c3d5; font-size: 14px; line-height: 1.55; }
	.route-viewer-chart { overflow: hidden; border: 1px solid #29324b; background: #090d1b; }
	.route-viewer-chart svg { display: block; width: 100%; height: clamp(520px, 70vh, 900px); }
	.viewer-terrain-area { fill: #55b9a7; fill-opacity: .09; stroke: none; }
	.viewer-terrain-line { fill: none; stroke: #67cfbf; stroke-width: 3.5; vector-effect: non-scaling-stroke; }
	.viewer-sample-line { stroke: #8c9bb4; stroke-width: 1; stroke-dasharray: 3 6; opacity: .68; }
	.viewer-sample-line--active { stroke: #f3f6ff; stroke-width: 1.5; stroke-dasharray: 3 4; opacity: .92; }
	.viewer-focused-dot { fill: #7bd1e8; stroke: #101627; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.viewer-highest-dot { fill: #ff9b76; stroke: #101627; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.viewer-wind-arrow { stroke: #f5d16a; stroke-width: 2.4; stroke-linecap: round; vector-effect: non-scaling-stroke; }
	.viewer-cloud-overflow-marker { fill: #f3c964; stroke: #0b1020; stroke-width: 1.4; vector-effect: non-scaling-stroke; }
	.viewer-level-mark { fill: #eff5fb; stroke: #11192a; stroke-width: 1.25; pointer-events: none; }
	.viewer-level-mark--missing { fill: #aab1bd; }
	.route-sample-hit { fill: transparent; fill-opacity: 0; stroke: none; cursor: pointer; pointer-events: all; }
	.route-sample-hit:focus { fill: #c6eaff; fill-opacity: .07; stroke: #83c8ff; stroke-width: 2; }
	.route-altitude-control { cursor: ns-resize; touch-action: none; }
	.route-altitude-control:focus { outline: none; }
	.profile-viewer { overflow-anchor: none; scrollbar-gutter: stable; }
	.route-nearest-level-slot { min-height: 44px; }
	.route-nearest-level-slot button { min-height: 40px; }
	.route-point-readout { margin: 10px 0; padding: 12px 14px; border: 1px solid #34445b; background: #11182a; font-variant-numeric: tabular-nums; }
	.route-readout-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; height: 28px; }
	.route-readout-heading strong { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #b6f6bc; }
	.route-readout-heading > span { flex-shrink: 0; color: #b3c0d4; font-size: 13px; }
	.route-readout-values { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
	.route-readout-values > div { display: flex; flex-direction: column; min-width: 0; height: 78px; }
	.route-readout-values span, .route-readout-values small { color: #b3c0d4; font-size: 13px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
	.route-readout-values strong { font-size: 21px; color: #f0f3fa; white-space: nowrap; }
	.route-point-readout p { margin: 0; height: 24px; font-size: 13px; color: #b3c0d4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	@media (max-width: 900px) {
		.route-readout-values { grid-template-columns: repeat(3, minmax(0, 1fr)); }
		.route-readout-heading { display: block; height: 52px; }
		.route-readout-heading strong, .route-readout-heading > span { display: block; }
	}
	.route-altitude-hit { fill: transparent; pointer-events: all; }
	.route-altitude-visible, .route-altitude-chevron, .route-altitude-readout { pointer-events: none; }
	.route-altitude-grip { fill: #63cf68; stroke: #13251a; stroke-width: 1.5; }
	.route-altitude-chevron { fill: none; stroke: #13251a; stroke-width: 1.5; }
	.route-altitude-readout rect { fill: #16291e; stroke: #63cf68; }
	.route-altitude-readout text { fill: #b6f6bc; font-size: 14px; font-weight: 600; }
	.route-altitude-control:focus-visible .route-altitude-grip { stroke: white; stroke-width: 3; }
	.viewer-route-detail { gap: 8px; margin-top: 18px; border: 1px solid #29324b; padding: 14px; background: #0a0d1b; }
	.viewer-route-detail > strong { color: #eef3fb; font-size: 18px; }
	.viewer-route-detail > span { color: #9badc6; font-size: 14px; }
	.viewer-route-detail > p.cloud-assessment { margin: 0; border-left: 3px solid currentColor; padding: 5px 9px; background: #131a2b; font-size: 15px; }
	.viewer-route-detail .humidity-cloud-note { color: #82c8e4; }
	.viewer-inline-error { border-left: 3px solid #db816f; padding: 9px 12px; background: #29191e; color: #f0b4a9; }
	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
	.altitude-lock { display: flex; gap: 10px; margin-top: 17px; border: 1px solid #dedbd3; border-radius: 8px; padding: 11px; background: #f6f3ed; }
	.lock-icon { display: grid; flex: 0 0 24px; width: 24px; height: 24px; place-items: center; border-radius: 50%; background: #e9e2d4; color: #825f3f; font-size: 16px; }
	.altitude-lock strong { color: #574737; font-size: 11px; }
	.altitude-lock p { margin: 4px 0 0; color: #756a5d; font-size: 10px; line-height: 1.55; }
	.footer-note { margin: 13px 0 0; color: #536466; font-size: 11px; line-height: 1.55; }
	/* Large-reading scale: keep secondary labels and dense data legible in Windy's sidebar. */
	.plugin-shell { font-size: 18px; line-height: 1.5; }
	.plugin-shell .eyebrow { font-size: 14px; }
	.plugin-shell .section-copy,
	.plugin-shell .point-empty-state p,
	.plugin-shell .inline-note,
	.plugin-shell .inline-error,
	.plugin-shell .footer-note,
	.plugin-shell .altitude-lock p { font-size: 16px; line-height: 1.6; }
	.plugin-shell .control-label,
	.plugin-shell .tiny-label,
	.plugin-shell .coord-value,
	.plugin-shell .point-facts,
	.plugin-shell .load-status,
	.plugin-shell .coordinate-entry label,
	.plugin-shell .point-error,
	.plugin-shell .muted-copy,
	.plugin-shell .route-toolbar,
	.plugin-shell .waypoint-list li,
	.plugin-shell .waypoint-list small,
	.plugin-shell .analysis-count,
	.plugin-shell .chart-scale,
	.plugin-shell .chart-empty,
	.plugin-shell .data-source-tag,
	.plugin-shell .forecast-time-row label,
	.plugin-shell .time-stepper button,
	.plugin-shell .profile-meta,
	.plugin-shell .interpolated-card > label,
	.plugin-shell .height-range-details summary,
	.plugin-shell .height-range-controls label,
	.plugin-shell .target-values > span,
	.plugin-shell .target-values small,
	.plugin-shell .chart-legend,
	.plugin-shell .cross-section-legend,
	.plugin-shell .route-weather-controls,
	.plugin-shell .route-color-key,
	.plugin-shell .route-sample-buttons button span,
	.plugin-shell .route-point-detail > span,
	.plugin-shell .route-diagnostic-details summary,
	.plugin-shell .route-diagnostic-details > p,
	.plugin-shell .route-diagnostic-details li strong,
	.plugin-shell .route-diagnostic-details li span,
	.plugin-shell .altitude-lock strong { font-size: 16px; }
	.plugin-shell .section-heading h2 { font-size: 23px; }
	.plugin-shell .weather-section-heading h3 { font-size: 21px; }
	.plugin-shell .segmented button,
	.plugin-shell .primary-button,
	.plugin-shell .secondary-button,
	.plugin-shell .small-button,
	.plugin-shell .text-button,
	.plugin-shell .metric-tabs button { font-size: 17px; }
	.plugin-shell .primary-button,
	.plugin-shell .secondary-button,
	.plugin-shell .small-button { min-height: 48px; }
	.plugin-shell .waypoint-index { font-size: 13px; }
	.plugin-shell .coordinate-entry input,
	.plugin-shell .sample-count-control input,
	.plugin-shell .height-range-controls input,
	.plugin-shell .forecast-time-row select,
	.plugin-shell .interpolated-card input { min-height: 48px; font-size: 17px; }
	.plugin-shell .profile-meta span { padding: 6px 9px; }
	.plugin-shell .target-values b { font-size: 20px; }
	.plugin-shell .chart-legend small,
	.plugin-shell .cross-section-legend small { font-size: 14px; line-height: 1.55; }
	.plugin-shell .profile-table { font-size: 15px; }
	.plugin-shell .profile-table th { font-size: 15px; }
	.plugin-shell .profile-table td:first-child { font-size: 15px; }
	.plugin-shell .profile-table td small { font-size: 14px; }
	.plugin-shell .route-sample-buttons button strong,
	.plugin-shell .route-point-detail > strong { font-size: 15px; }
	.plugin-shell .chart-heading-label,
	.plugin-shell .profile-chart-frame .axis-label,
	.plugin-shell .cross-section-frame .axis-label { font-size: 16px; }
	.plugin-shell .profile-chart-frame svg text,
	.plugin-shell .cross-section-frame svg text { font-size: 16px !important; }
	.plugin-shell .route-color-key i { width: 16px; height: 14px; }
	/* Enlarge the remaining point summaries and full-screen chart labels. */
	.plugin-shell .coordinate-format-note,
	.plugin-shell .coordinate-provenance,
	.plugin-shell .point-summary-copy span,
	.plugin-shell .route-summary-card > div span,
	.plugin-shell .diagnostic-copy-fallback,
	.plugin-shell .route-comparison-intro,
	.plugin-shell .route-terrain-note { font-size: 17px; line-height: 1.6; }
	.profile-viewer { font-size: 18px; line-height: 1.55; }
	.profile-viewer .viewer-stat-grid span,
	.profile-viewer .viewer-provenance,
	.profile-viewer .viewer-section-head > span,
	.profile-viewer .viewer-chart-legend,
	.profile-viewer .viewer-chart-legend small,
	.profile-viewer .route-chart-note,
	.profile-viewer .route-terrain-note,
	.profile-viewer .viewer-footnote { font-size: 16px; line-height: 1.6; }
	.profile-viewer .viewer-table { font-size: 16px; }
	.profile-viewer .viewer-table th,
	.profile-viewer .viewer-table td small { font-size: 16px; }
	.profile-viewer .viewer-axis-label,
	.profile-viewer .viewer-axis-title,
	.profile-viewer .viewer-target-label,
	.profile-viewer .viewer-query-value-label,
	.profile-viewer .viewer-below-terrain-label,
	.profile-viewer .viewer-terrain-label { font-size: 17px; }
	@media (max-width: 760px) {
		.viewer-page { padding: 18px 16px calc(28px + env(safe-area-inset-bottom)); }
		.viewer-header { gap: 12px; }
		.viewer-header h1 { font-size: 28px; }
		.viewer-close { flex-basis: 46px; width: 46px; height: 46px; }
		.viewer-timebar { align-items: stretch; flex-direction: column; gap: 10px; padding: 11px; }
		.viewer-time-controls { align-items: stretch; }
		.viewer-time-controls label { min-width: 0; flex: 1; }
		.viewer-time-controls select { width: 100%; }
		.viewer-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 15px 0 22px; }
		.viewer-stat-grid > div { min-height: 64px; padding: 8px 10px; }
		.viewer-stat-grid strong { font-size: 17px; }
		.viewer-provenance { gap: 6px; font-size: 14px; }
		.multiple-altitude-details { padding: 10px; }
		.multi-altitude-input-row { grid-template-columns: minmax(0, 1fr) auto; gap: 7px; }
		.multi-altitude-input-row label { font-size: 15px; }
		.multi-altitude-input-row input, .multi-altitude-input-row .secondary-button { min-height: 48px; }
		.viewer-section-head { align-items: flex-start; flex-direction: column; gap: 3px; }
		.viewer-section-head h2 { font-size: 21px; }
		.route-comparison-grid { grid-template-columns: 1fr; }
		.route-comparison-values { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.trend-grid { grid-template-columns: 1fr; }
		.trend-panel svg { height: clamp(270px, 38vh, 360px); }
		.viewer-target-control { align-items: flex-start; flex-direction: column; gap: 8px; }
		.terrain-override-control { grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 10px; }
		.terrain-override-control > p { grid-column: 1; }
		.terrain-override-actions { align-items: stretch; }
		.target-result-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
		.target-result-grid > div { min-height: 68px; padding: 8px 10px; }
		.target-result-grid strong { font-size: 19px; }
		.viewer-chart-legend { gap: 7px 12px; font-size: 14px; }
		.precipitation-section { padding: 10px; }
		.precipitation-chart svg { height: 128px; }
		.route-viewer-controls { align-items: flex-start; flex-direction: column; }
		.altitude-presets button { min-height: 44px; padding: 0 10px; }
		.profile-viewer .metric-tabs { display: grid; width: 100%; grid-template-columns: repeat(3, minmax(0, 1fr)); }
		.profile-viewer .metric-tabs button { min-height: 44px; padding: 0 6px; }
		.route-viewer-chart svg { height: clamp(360px, 48vh, 560px); }
		.possible-cloud-list > div { align-items: flex-start; flex-direction: column; gap: 2px; }
		.route-weather-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.route-weather-summary .viewer-open-button { grid-column: 1 / -1; grid-row: auto; }
		.point-summary-card { grid-template-columns: minmax(0, 1fr); }
		.point-summary-card .viewer-open-button { grid-column: 1; grid-row: auto; width: 100%; }
	}
	@media (max-width: 480px) {
		.plugin-shell { padding-bottom: max(24px, env(safe-area-inset-bottom)); }
		.intro-row { margin-top: 13px; }
		.plugin-shell .eyebrow { font-size: 12px; letter-spacing: .06em; }
		.plugin-shell .plugin-version { font-size: 13px; }
		.plugin-shell .section-heading h2 { font-size: 20px; }
		.model-row { column-gap: 10px; }
		.control-group { gap: 5px; }
		.control-label { font-size: 13px; }
		.segmented button { min-height: 44px; }
		.segmented.compact button { min-height: 44px; padding: 0 8px; }
		.plugin-shell .section-copy,
		.plugin-shell .coordinate-format-note { font-size: 15px; line-height: 1.55; }
		.time-stepper button { min-height: 44px; }
		.text-button { min-height: 44px; }
		.primary-button, .secondary-button, .small-button { min-height: 44px; }
		.metric-tabs { width: 100%; justify-content: space-between; }
		.metric-tabs button { min-height: 40px; flex: 1; padding: 0 5px; }
		.profile-chart-frame svg { height: 225px; }
		.cross-section-frame svg { height: 205px; }
		.weather-section { padding: 10px; }
		.route-diagnostic-details li { grid-template-columns: 1fr; }
		.route-diagnostic-details li button { width: 100%; }
		.target-values { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.route-sample-buttons button { flex-basis: 29%; }
		.chart-frame svg, .chart-empty { height: 170px; }
		.viewer-page { padding-right: 12px; padding-left: 12px; }
		.viewer-time-controls { flex-direction: column; }
		.viewer-time-controls .time-stepper { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.trend-panel-heading { align-items: flex-start; flex-direction: column; gap: 2px; padding: 11px 12px 0; }
		.trend-panel-heading > span { max-width: 100%; text-align: left; }
		.trend-panel svg { height: 300px; }
		.viewer-target-control input { width: 94px; }
		.cloud-level-list > div { grid-template-columns: minmax(88px, .8fr) minmax(40px, 1fr) 44px; gap: 8px; padding: 7px; }
		.viewer-table { min-width: 570px; font-size: 14px; }
	}

	@media (max-width: 360px) {
		.model-row { grid-template-columns: minmax(0, 1fr); row-gap: 10px; }
		.model-control-group .segmented,
		.unit-control-group .segmented { width: 100%; }
		.unit-control-group { justify-self: stretch; align-items: flex-start; }
		.unit-control-group .segmented button { flex: 1 1 0; }
	}
	@media (prefers-reduced-motion: reduce) {
		.plugin-shell :global(*) { scroll-behavior: auto !important; transition-duration: .01ms !important; }
	}
</style>
