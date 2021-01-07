import React from 'react'
import ReactDOM from 'react-dom'
import AstarGrid from './components/AstarGrid.component.js'

// Just adds a header
class App extends React.Component {

	render() {
		return (
			<>
				<div id="header">
					<p>You are A*</p>
				</div>
				<AstarGrid />
			</>
		);
	}
}

ReactDOM.render(<App />, document.getElementById('root'));
